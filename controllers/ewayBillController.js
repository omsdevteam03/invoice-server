import { generateEwayBill, updateEwayVehicle, cancelEwayBill } from '../services/ewayBillService.js';
import { getInvoiceById, saveInvoice } from '../models/invoiceModel.js';

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /\b[1-9]\d{5}\b/;
const HSN_REGEX = /^(\d{4}|\d{6}|\d{8})$/;
const VEHICLE_REGEX = /^[A-Z]{2}\d{2}[A-Z]{0,3}\d{4}$/;
const EWB_MIN_VALUE = 50000;

const validateForEwayBill = (inv, vehicleNo) => {
    const errors = [];

    if ((inv.invoiceNo || '').startsWith('PI-'))
        errors.push('E-Way Bill cannot be generated for a Proforma invoice');

    if (Number(inv.total) <= EWB_MIN_VALUE)
        errors.push(`E-Way Bill is only needed when the invoice value is above ₹${EWB_MIN_VALUE.toLocaleString('en-IN')}`);

    if (!GSTIN_REGEX.test((inv.companyGSTIN || '').trim().toUpperCase()))
        errors.push('Company GSTIN is missing or invalid');

    if (!inv.buyerName?.trim()) errors.push('Buyer name is required');

    const address = (inv.buyerAddress || '').trim();
    if (address.length < 10) errors.push('Buyer address is too short');
    if (!PINCODE_REGEX.test(address)) errors.push('Buyer address must include a 6-digit pincode');

    const mobile = (inv.buyerMobile || '').replace(/^\+?91/, '').replace(/\D/g, '');
    if (!MOBILE_REGEX.test(mobile)) errors.push('Buyer mobile must be a valid 10-digit number');

    const bg = (inv.buyerGSTIN || '').trim().toUpperCase();
    if (bg && !GSTIN_REGEX.test(bg)) errors.push('Buyer GSTIN is invalid');

    if (!inv.items?.length) errors.push('Add at least one item');
    (inv.items || []).forEach((it, i) => {
        const n = i + 1;
        if (!HSN_REGEX.test(String(it.hsnCode || ''))) errors.push(`Item ${n}: HSN code must be 4, 6 or 8 digits`);
        if (!(Number(it.qty) > 0)) errors.push(`Item ${n}: quantity must be greater than 0`);
        if (!(Number(it.rate) > 0)) errors.push(`Item ${n}: rate must be greater than 0`);
        if (!it.unit) errors.push(`Item ${n}: unit is required`);
    });

    if (!VEHICLE_REGEX.test((vehicleNo || '').toUpperCase().replace(/[\s-]/g, '')))
        errors.push('Vehicle number is invalid (example: TN01AB1234)');

    return errors;
};

export const createEwayBill = async (req, reply) => {
    try {
        const { invoiceId, vehicleNo, transporterId } = req.body;

        if (!invoiceId) return reply.status(400).send({ message: 'invoiceId is required' });
        if (!vehicleNo) return reply.status(400).send({ message: 'vehicleNo is required' });

        // 1. Fetch the invoice from DB (respect user's data scope)
        const inv = await getInvoiceById(invoiceId, req.dataScope);
        if (!inv) return reply.status(404).send({ message: 'Invoice not found' });

        if (inv.eway_bill_no) {
            return reply.status(400).send({
                message: 'E-Way Bill already generated',
                ewayBillNo: inv.eway_bill_no,
            });
        }

        // 1b. Validate the invoice data before touching the GSP
        const errors = validateForEwayBill(toUpsertShape(inv), vehicleNo);
        if (errors.length > 0) {
            return reply.status(400).send({
                message: 'Invoice validation failed',
                details: errors,
            });
        }

        // 2. Convert DB row → invoice object for the service
        const invoice = {
            id: inv.id,
            invoiceNo: inv.invoice_no,
            date: inv.date,
            companyName: inv.company_name,
            companyGSTIN: inv.company_gstin,
            companyAddress: inv.company_address,
            buyerName: inv.buyer_company_name || inv.buyer_name,
            buyerGSTIN: inv.buyer_gstin,
            buyerAddress: inv.buyer_address,
            gstType: inv.gst_type,
            gstPercent: Number(inv.gst_percent || 18),
            total: Number(inv.total),
            items: inv.items || [],
        };

        
        // 3. Call the GSP
        const cleanVehicleNo = vehicleNo.toUpperCase().replace(/[\s-]/g, '');
        const result = await generateEwayBill({ invoice, vehicleNo: cleanVehicleNo, transporterId });

        // 4. Save the EWB number + Part-B details to the invoice
        const ewayBillDetails = {
            vehicleNo: cleanVehicleNo,
            fromPlace: result.fromPlace,
            toPlace: result.toPlace,
            transporterId: transporterId || '',
        };
        await saveInvoice(
            {
                ...toUpsertShape(inv),
                ewayBillNo: result.ewayBillNo,
                ewayBillDate: result.ewayBillDate,
                ewayBillValidUpto: result.validUpto,
                ewayBillDetails,
            },
            req.dataScope,
            inv.company_id,
            { id: req.user?.id, name: req.user?.name }
        );
    return reply.send({
      ewayBillNo: result.ewayBillNo,
      ewayBillDate: result.ewayBillDate,
      validUpto: result.validUpto,
      ewayBillDetails,
    });
  } catch (err) {
    req.log.error('===== EWB ERROR =====');
    req.log.error(err.message);
    if (err.response) {
      req.log.error('Status: ' + err.response.status);
      req.log.error('Data: ' + JSON.stringify(err.response.data, null, 2));
    }
    const msg = err.response?.data?.message
             || err.response?.data?.error
             || err.message;
    return reply.status(500).send({
      message: 'EWB generation failed',
      error: msg,
      details: err.response?.data || null
    });
  }
};
// Helper: convert DB row → shape expected by saveInvoice()
function toUpsertShape(inv, logMessage = 'E-Way Bill generated') {
    return {
        id: inv.id,
        invoiceNo: inv.invoice_no,
             buyerSalutation: inv.buyer_salutation,
        buyerName: inv.buyer_name,
        buyerCompanyName: inv.buyer_company_name,   buyerName: inv.buyer_name,
        buyerCompanyName: inv.buyer_company_name,
        buyerAddress: inv.buyer_address,
        buyerMobile: inv.buyer_mobile,
        buyerGSTIN: inv.buyer_gstin,
        date: inv.date,
        dueDate: inv.due_date,
        status: inv.status,
        gstType: inv.gst_type,
        gstPercent: Number(inv.gst_percent || 18),
        items: inv.items,
        amountPaid: Number(inv.amount_paid || 0),
        total: Number(inv.total),
        amountDue: Number(inv.amount_due),
        notes: inv.notes,
        signature: inv.signature,
        companyName: inv.company_name,
        companyAddress: inv.company_address,
        companyMobile: inv.company_mobile,
        companyEmail: inv.company_email,
        companyGSTIN: inv.company_gstin,
        logo: inv.logo,
        fromQuotationId: inv.from_quotation_id,
        invoiceLang: inv.invoice_lang || 'en',
        payments: inv.payments || [],
        activityLog: [
            ...(inv.activity_log || []),
            { message: logMessage, date: new Date().toISOString() },
        ],
        convertedFromId: inv.converted_from_id,
        convertedInvoiceId: inv.converted_invoice_id,
        ewayBillNo: inv.eway_bill_no,
        ewayBillDate: inv.eway_bill_date,
        ewayBillValidUpto: inv.eway_bill_valid_upto,
        ewayBillDetails: inv.eway_bill_details,
    };
}

export const updateVehicle = async (req, reply) => {
    try {
        const { invoiceId, vehicleNo, fromPlace } = req.body;
        if (!invoiceId || !vehicleNo || !fromPlace) {
            return reply.status(400).send({ message: 'invoiceId, vehicleNo and fromPlace are required' });
        }
        const inv = await getInvoiceById(invoiceId, req.dataScope);
        if (!inv) return reply.status(404).send({ message: 'Invoice not found' });
        if (!inv.eway_bill_no) return reply.status(400).send({ message: 'No E-Way Bill on this invoice' });

        await updateEwayVehicle({
            gstin: inv.company_gstin, ewbNo: inv.eway_bill_no, vehicleNo, fromPlace,
        });
        const ewayBillDetails = {
            ...(inv.eway_bill_details || {}),
            vehicleNo: vehicleNo.toUpperCase().replace(/[\s-]/g, ''),
            fromPlace,
        };
        await saveInvoice(
            { ...toUpsertShape(inv, `E-Way Bill vehicle updated to ${vehicleNo}`), ewayBillDetails },
            req.dataScope, inv.company_id, { id: req.user?.id, name: req.user?.name }
        );
        return reply.send({ message: 'Vehicle updated', vehicleNo, ewayBillDetails });
    } catch (err) {
        req.log.error(err.message);
        return reply.status(500).send({ message: 'Vehicle update failed', error: err.message });
    }
};

export const cancelEway = async (req, reply) => {
    try {
        const { invoiceId, reasonCode } = req.body;
        if (!invoiceId || !reasonCode) {
            return reply.status(400).send({ message: 'invoiceId and reasonCode are required' });
        }
        const inv = await getInvoiceById(invoiceId, req.dataScope);
        if (!inv) return reply.status(404).send({ message: 'Invoice not found' });
        if (!inv.eway_bill_no) return reply.status(400).send({ message: 'No E-Way Bill on this invoice' });

        await cancelEwayBill({ gstin: inv.company_gstin, ewbNo: inv.eway_bill_no, reasonCode });
        await saveInvoice(
            {
                ...toUpsertShape(inv, `E-Way Bill ${inv.eway_bill_no} cancelled`),
                ewayBillNo: null, ewayBillDate: null, ewayBillValidUpto: null, ewayBillDetails: null,
            },
            req.dataScope, inv.company_id, { id: req.user?.id, name: req.user?.name }
        );
        return reply.send({ message: 'E-Way Bill cancelled' });
    } catch (err) {
        req.log.error(err.message);
        return reply.status(500).send({ message: 'Cancel failed', error: err.message });
    }
};