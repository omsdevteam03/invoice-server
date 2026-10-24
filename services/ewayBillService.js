import axios from 'axios';

const BASE_URL = process.env.SANDBOX_BASE_URL || 'https://api.sandbox.co.in';
const API_KEY = process.env.SANDBOX_API_KEY;
const API_SECRET = process.env.SANDBOX_API_SECRET;

// ─── Step 1: Authenticate with the GSP (get Sandbox JWT token) ──────────
async function getGspToken() {
  const { data } = await axios.post(
    `${BASE_URL}/authenticate`,
    {},
    {
      headers: {
        'x-api-key': API_KEY,
        'x-api-secret': API_SECRET,
        'x-api-version': '1.0.0',
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
    }
  );
  return data.access_token;
}

// ─── Step 2: Authenticate with the E-Way Bill portal ─────────────────────
async function getEwbSessionToken(gspToken, gstin) {
  const { data } = await axios.post(
    `${BASE_URL}/gst/compliance/e-way-bill/tax-payer/authenticate`,
    {
      username: process.env.SANDBOX_EWB_USERNAME,
      password: process.env.SANDBOX_EWB_PASSWORD,
      gstin: gstin,
    },
    {
      headers: {
        'authorization': gspToken,
        'x-api-key': API_KEY,
        'x-api-version': '1.0.0',
        'x-source': 'primary',
        'Content-Type': 'application/json',
      },
    }
  );
  return data.data?.access_token || data.access_token;
}

const pincodeOf = (addr) => (String(addr || '').match(/\b\d{6}\b/) || [])[0];
const stateOf = (gstin) => (/^\d{2}/.test(gstin || '') ? Number(gstin.slice(0, 2)) : null);

// Best-effort city from the address: drops the pincode and state part,
// then takes the last remaining segment (e.g. "...,Marthandam,TamilNadu-629165" -> "Marthandam")
const placeOf = (addr) => {
  const parts = String(addr || '')
    .split(/[,\n]/)
    .map(s => s.replace(/\b\d{6}\b/g, '').replace(/[-–.\s]+$/, '').trim())
    .filter(Boolean);
  const place = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return (place || 'NA').slice(0, 50);
};

// ─── Step 3: Generate the EWB ────────────────────────────────────────────
export async function generateEwayBill({ invoice, vehicleNo, transporterId }) {
  // ✅ Diagnostic logs — will show exactly what invoice number is being sent
  console.log('>>> INVOICE NUMBER BEING SENT TO NIC:', invoice.invoiceNo);
  console.log('>>> INVOICE DATE:', invoice.date);
  console.log('>>> SELLER GSTIN:', invoice.companyGSTIN);

  if (!invoice.companyGSTIN) throw new Error('Seller GSTIN missing on invoice');
  if (!invoice.items?.length) throw new Error('Invoice has no items');
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(String(invoice.invoiceNo || ''))) {
    throw new Error('Invoice number must be 1 to 16 characters: letters, digits, "/" or "-" only');
  }

  // 1. Get Sandbox JWT token
  const gspToken = await getGspToken();

  // 2. Get EWB session token for this seller GSTIN
  const ewbToken = await getEwbSessionToken(gspToken, invoice.companyGSTIN);

  // 3. Build the EWB payload
  const fromPincode = Number(pincodeOf(invoice.companyAddress));
  const toPincode = Number(pincodeOf(invoice.buyerAddress));
  const fromStateCode = stateOf(invoice.companyGSTIN);
  const toStateCode = stateOf(invoice.buyerGSTIN) || fromStateCode;
  if (!fromPincode) throw new Error('Seller address must contain a 6-digit pincode');
  if (!toPincode) throw new Error('Buyer address must contain a 6-digit pincode');

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const gstPct = invoice.gstType === 'No GST' ? 0 : Number(invoice.gstPercent) || 0;
  const sameState = fromStateCode === toStateCode;

  // Your unit names -> codes the e-way bill system accepts
  const NIC_UNITS = {
    Nos: 'NOS', Pcs: 'PCS', Kg: 'KGS', Gram: 'GMS', Ton: 'TON', Litre: 'LTR',
    ml: 'MLT', Meter: 'MTR', 'Sq.ft': 'SQF', Box: 'BOX', Bag: 'BAG', Set: 'SET',
  };

  const items = invoice.items.map((it, i) => {
    const hsn = String(it.hsnCode || '').trim();
    if (!/^\d{4,8}$/.test(hsn)) {
      throw new Error(`Item ${i + 1}: add a valid HSN code (4 to 8 digits) before generating`);
    }
    const amount = Number(it.amount) || 0;
    // "GST Included": the item amount already contains GST, so take it out
    const taxable = invoice.gstType === 'GST Included'
      ? round2(amount / (1 + gstPct / 100))
      : round2(amount);
    return {
      itemNo: i + 1,
      productName: (it.description || 'Item').slice(0, 100),
      productDesc: (it.description || 'Item').slice(0, 100),
      hsnCode: Number(hsn),
      quantity: Number(it.qty) || 1,
      qtyUnit: NIC_UNITS[it.unit] || 'OTH',
      taxableAmount: taxable,
      cgstRate: sameState ? gstPct / 2 : 0,
      sgstRate: sameState ? gstPct / 2 : 0,
      igstRate: sameState ? 0 : gstPct,
      cessRate: 0,
    };
  });

  const totalTaxable = round2(items.reduce((s, i) => s + i.taxableAmount, 0));
  const taxTotal = round2(totalTaxable * gstPct / 100);
  const halfTax = round2(taxTotal / 2);

  const payload = {
    supplyType: 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo: invoice.invoiceNo,   // ← THIS is what NIC checks for duplicates
    docDate: formatDate(invoice.date),
    fromGstin: invoice.companyGSTIN,
    fromTrdName: invoice.companyName,
    fromAddr1: (invoice.companyAddress || '').slice(0, 100),
    fromPlace: placeOf(invoice.companyAddress),
    fromPincode,
    actFromStateCode: fromStateCode,
    fromStateCode,
    toGstin: invoice.buyerGSTIN || 'URP',
    toTrdName: invoice.buyerName,
    toAddr1: (invoice.buyerAddress || '').slice(0, 100),
    toPlace: placeOf(invoice.buyerAddress),
    toPincode,
    actToStateCode: toStateCode,
    toStateCode,
    transactionType: 1,
    actualDist: 0,
    transMode: '1',
    transDistance: '0',
    vehicleNo: vehicleNo,
    transporterId: transporterId || '',
    transporterName: '',
    transDocNo: '',
    transDocDate: '',
    totalValue: totalTaxable,          // taxable total, NOT the grand total
    taxableAmount: totalTaxable,
    cgstValue: sameState ? halfTax : 0,
    sgstValue: sameState ? round2(taxTotal - halfTax) : 0,
    igstValue: sameState ? 0 : taxTotal,
    cessValue: 0,
    totInvValue: Number(invoice.total) || 0,
    itemList: items,
  };

  console.log('>>> PAYLOAD docNo BEING SENT:', payload.docNo);

  // TEMPORARY: lets you test saving and display while the sandbox returns 604
  console.log('>>> EWB_MOCK value is:', JSON.stringify(process.env.EWB_MOCK));
  if (String(process.env.EWB_MOCK || '').replace(/['"\s]/g, '').toLowerCase() === 'true') {
    const now = new Date();
    console.log('>>> EWB MOCK MODE: returning a FAKE e-way bill number');
    return {
      fromPlace: payload.fromPlace, toPlace: payload.toPlace,
      ewayBillNo: String(Date.now()).slice(-12),
      ewayBillDate: now.toISOString(),
      validUpto: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      raw: { mock: true, payload },
    };
  }

  // 4. Call Sandbox EWB generate API
  const { data } = await axios.post(
    `${BASE_URL}/gst/compliance/e-way-bill/consignor/bill`,
    payload,
    {
      headers: {
        'authorization': gspToken,
        'x-api-key': API_KEY,
        'x-api-version': '1.0.0',
        'x-ewb-token': ewbToken,
        'x-source': 'primary',
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('===== SANDBOX EWB RESPONSE =====');
  console.log(JSON.stringify(data, null, 2));
  console.log('=================================');

  const nicStatus = data?.data?.status;
  const errorCodes = data?.data?.error?.errorCodes;
  const errorInfo = data?.data?.info;

  if (nicStatus !== '1') {
    const friendly = {
      '604': 'An E-Way Bill already exists for this document number. Change the invoice number and try again.',
      '208': 'Invalid seller GSTIN.',
      '212': 'Invalid buyer GSTIN.',
      '393': 'Invalid GSTIN.',
      '210': 'Seller pincode is invalid or blank.',
      '211': 'Seller state code is invalid or blank.',
      '214': 'Buyer pincode is invalid.',
      '215': 'Buyer state code is invalid.',
      '216': 'Invalid HSN code. Add a valid HSN to every item.',
      '225': 'Invalid vehicle number format (example: TN01AB1234).',
      '238': 'E-way bill login failed. Check the sandbox username and password.',
      '436': 'Buyer pincode does not belong to the buyer state.',
      '437': 'Seller pincode does not belong to the seller state.',
      '710': 'Pincode does not match the state code.',
      '724': 'At least one item must be goods, not a service HSN.',
    };
    const codes = String(errorCodes || '').split(',').map(s => s.trim()).filter(Boolean);
    const msg = codes.length
      ? codes.map(c => (friendly[c] ? `${friendly[c]} (code ${c})` : `NIC error code ${c}`)).join(' | ')
      : `E-Way Bill failed ${errorInfo || ''}`.trim();
    throw new Error(msg);
  }

  const findValue = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of Object.keys(obj)) {
      if (keys.includes(k) && obj[k]) return obj[k];
      const nested = findValue(obj[k], keys);
      if (nested) return nested;
    }
    return null;
  };

  const ewbNo = findValue(data, [
    'EwbNo', 'eway_bill_no', 'ewbNo', 'billNo', 'EwbNumber', 'ewayBillNo',
  ]);
  const ewbDate = findValue(data, [
    'EwbDt', 'eway_bill_date', 'ewbDate', 'EwbDate',
  ]) || new Date().toISOString();
  const validUpto = findValue(data, [
    'EwbValidTill', 'valid_upto', 'validUpto', 'EwbValidUpTo',
  ]);

  if (!ewbNo) {
    throw new Error('E-Way Bill generated but number missing in response: ' + JSON.stringify(data));
  }

  return {
    fromPlace: payload.fromPlace, toPlace: payload.toPlace,
    ewayBillNo: ewbNo,
    ewayBillDate: nicToIso(ewbDate) || new Date().toISOString(),
    validUpto: nicToIso(validUpto),
    raw: data,
  };
}

function formatDate(d) {
  if (!d) return new Date().toISOString().split('T')[0].split('-').reverse().join('/');
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function nicToIso(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d.toISOString(); }
  let [, dd, mm, yyyy, h, mi, ss, ap] = m;
  h = Number(h);
  if (ap) {
    ap = ap.toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
  }
  // NIC times are IST
  return new Date(`${yyyy}-${mm}-${dd}T${String(h).padStart(2, '0')}:${mi}:${ss}+05:30`).toISOString();
}

// ─── Update vehicle (Part B) and Cancel ──────────────────────────────────
const mockOn = () =>
  String(process.env.EWB_MOCK || '').replace(/['"\s]/g, '').toLowerCase() === 'true';

const NIC_MSG = {
  '225': 'Invalid vehicle number format (example: KA01AB1234).',
  '311': 'Validity period lapsed, vehicle cannot be updated.',
  '312': 'This e-way bill is not generated by you, or is already cancelled.',
  '315': 'Validity period lapsed, you cannot cancel this e-way bill.',
  '316': 'E-way bill is already verified, you cannot cancel it.',
  '728': 'Cancel is allowed only within 24 hours.',
};

async function callEwb(path, body, gstin) {
  if (!path) throw new Error('Set EWB_VEHICLE_PATH / EWB_CANCEL_PATH in .env (copy from the Sandbox.co.in API docs)');
  const gspToken = await getGspToken();
  const ewbToken = await getEwbSessionToken(gspToken, gstin);
  const { data } = await axios.post(`${BASE_URL}${path}`, body, {
    headers: {
      'authorization': gspToken,
      'x-api-key': API_KEY,
      'x-api-version': '1.0.0',
      'x-ewb-token': ewbToken,
      'x-source': 'primary',
      'Content-Type': 'application/json',
    },
  });
  console.log('===== SANDBOX EWB ACTION RESPONSE =====');
  console.log(JSON.stringify(data, null, 2));
  if (data?.data?.status !== '1') {
    const codes = String(data?.data?.error?.errorCodes || '').split(',').map(s => s.trim()).filter(Boolean);
    throw new Error(codes.length
      ? codes.map(c => (NIC_MSG[c] ? `${NIC_MSG[c]} (code ${c})` : `NIC error code ${c}`)).join(' | ')
      : `E-Way Bill action failed ${data?.data?.info || ''}`.trim());
  }
  return data;
}

export async function updateEwayVehicle({ gstin, ewbNo, vehicleNo, fromPlace }) {
  if (mockOn()) { console.log('>>> EWB MOCK: vehicle update'); return { mock: true }; }
  return callEwb(process.env.EWB_VEHICLE_PATH, {
    ewbNo: Number(ewbNo),
    vehicleNo,
    fromPlace,
    fromState: Number(String(gstin).slice(0, 2)),
    reasonCode: '3',               // 1 Breakdown, 2 Transshipment, 3 Others, 4 First time
    reasonRem: 'Vehicle changed',
    transMode: '1',
    vehicleType: 'R',
  }, gstin);
}

export async function cancelEwayBill({ gstin, ewbNo, reasonCode }) {
  if (mockOn()) { console.log('>>> EWB MOCK: cancel'); return { mock: true }; }
  return callEwb(process.env.EWB_CANCEL_PATH, {
    ewbNo: Number(ewbNo),
    cancelRsnCode: Number(reasonCode),   // 1 Duplicate, 2 Order cancelled, 3 Data entry mistake, 4 Others
    cancelRmrk: 'Cancelled from InvoicePro',
  }, gstin);
}