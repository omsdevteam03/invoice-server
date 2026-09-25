// server/controllers/chatController.js

import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import * as chatModel from "../models/chatModel.js";
import * as customerModel from "../models/customerModel.js";
import * as quotationModel from "../models/quotationModel.js";
import * as invoiceModel from "../models/invoiceModel.js";
import * as settingsModel from "../models/settingsModel.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Server-safe mirror of projectTemplates in QuotationTable.jsx (no JSX/icons —
// can't import that file into the backend). Keep these two lists in sync.
const QUOTATION_TEMPLATES = [
  // "default" mirrors QuotationDetail.jsx's own fallback: templateStyle
  // "default" (or falsy) renders the plain "Customize Your Own" layout,
  // not any of the six styled templates below. This is what the AI uses
  // whenever the user doesn't ask for a specific look.
  { id: "proj-custom", title: "Customize Your Own", timeline: "7–14 working days", templateStyle: "default" },
  { id: "proj-classic", title: "Classic Formal", timeline: "7–10 working days", templateStyle: "classic" },
  { id: "proj-creative", title: "Creative", timeline: "10–14 working days", templateStyle: "creative" },
  { id: "proj-elegant", title: "Elegant", timeline: "3 months", templateStyle: "bold" },
  { id: "proj-modern", title: "Modern Professional", timeline: "14–20 working days", templateStyle: "modern" },
  { id: "proj-minimal", title: "Minimal", timeline: "30–45 working days", templateStyle: "minimal" },
  { id: "proj-corporate", title: "Corporate", timeline: "10–15 working days", templateStyle: "corporate" },
];
const DEFAULT_TEMPLATE_ID = "proj-custom";
function getTemplate(templateId) {
  return QUOTATION_TEMPLATES.find((t) => t.id === templateId)
    || QUOTATION_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
}

// Same fixed boilerplate handleNewFromTemplate uses in QuotationsPage.jsx —
// identical across every template style, so it's reused as-is here.
const STANDARD_SCOPE_OF_WORK = "Responsive Website Design\n5 Website Pages\nContact Form Integration\nMobile Optimization\nBasic SEO Setup";
const STANDARD_DELIVERABLES = "Fully responsive website\nSource code delivery\nAdmin panel access\nDocumentation\n30 days support";
const STANDARD_TECHNOLOGY = "React.js / Next.js (Frontend)\nNode.js & Express.js (Backend)\nMongoDB (Database)\nCloud Hosting (Deployment)";
const STANDARD_TIMELINE_DESC = "Completed within 7–14 working days from project confirmation\nDevelopment carried out in phases\nRegular progress updates shared with client";
const STANDARD_PAYMENT_TERMS = "50% advance payment required before project commencement\nRemaining 50% after preview approval and before final delivery";
const STANDARD_TERMS = "This quotation is valid for 30 days from the date of issue\nAny additional work outside the agreed scope will be charged separately\n50% advance payment is required before project commencement\nFinal deliverables handed over after full payment is received";
const SYSTEM_INSTRUCTION =
  "You are Nexa, the Invoice Pro assistant embedded in OrangeMega's CRM dashboard. " +
  "You can look up, create, edit, and delete customers, quotations, and invoices directly " +
  "when the user asks — don't just describe how to do it, actually call the tool. " +
  "Never guess or estimate counts, totals, or statistics. For any question about how many " +
  "quotations exist or their status breakdown, always call get_quotation_stats and report its " +
  "exact numbers — do not answer from memory or make up figures. " +
  "If required info is missing (e.g. no customer name, no items), ask a short clarifying " +
  "question before calling a tool. Before creating a quotation or invoice, always call " +
  "search_customers first to check if the customer already exists — only call create_customer " +
  "if they don't. When creating a quotation, use the templateId matching any style the user " +
  "mentions (classic/formal, creative, elegant/bold, modern, minimal, corporate) — otherwise " +
  "omit templateId entirely and the plain default layout will be used. Always include a short, " +
  "clear project description summarizing what the quotation is for, even if the user didn't " +
  "explicitly dictate one — infer it from the conversation and the items being quoted. When " +
  "creating a quotation, you must also write scopeOfWork, deliverables, technologyUsed, and " +
  "timelineDesc yourself, tailored specifically to the project's title/description — never " +
  "reuse generic 'website development' boilerplate for a different kind of project (e.g. an " +
 "ecommerce site needs scope items like product catalog, cart, checkout, payment gateway; " +
"a mobile app needs app-store submission, push notifications, etc). Each of these fields " +
"is an array — put one distinct item per array entry, never multiple items joined into a " +
"single string. " +
 "If the user asks for a long, detailed, thorough, or multi-page quotation, go far beyond the " +
"minimum: write substantially longer scopeOfWork/deliverables/technologyUsed/timelineDesc " +
"(8-15 lines each instead of 4-5), and add 6-10 customSections that together read like a full " +
"proposal document, not a short quote. Mix paragraph and table sections depending on what the " +
"content actually is: use type 'table' for anything that is naturally a list of rows — a " +
"feature/module breakdown (columns like Feature/Description or Module/Functionality), package " +
"or pricing tiers (columns like Package/Price/Scope), or a phased project timeline (columns " +
"like Phase/Activities/Duration). Use type 'paragraph' for narrative sections — company " +
"profile, methodology/process, why choose us, assumptions & exclusions, support & maintenance " +
"terms, and a closing summary/approval section. For an e-commerce, SaaS, or app-style project, " +
"always include a customer-facing features table and a separate admin/management features " +
"table, each with 10+ realistic rows for that specific project type — never leave a feature " +
"table thin or generic. Always write in clean, professional, grammatically correct English " +
"regardless of how the user's own prompt is worded — correct any grammar, spelling, or phrasing " +
"issues from the user's request rather than carrying them into the quotation. " +
  "When creating an invoice, " +
  "pass type: 'Proforma' only if the user explicitly says proforma/PI — otherwise leave it as " +
  "the default Final invoice. " +
  "Before editing or deleting anything, always call the matching search/find " +
  "tool first to locate the exact record and confirm you have the right one — never guess an ID. " +
  "For deletes specifically, briefly confirm with the user which record you're about to delete " +
  "before calling the delete tool, unless they already named it precisely (e.g. an exact invoice " +
  "number). After any tool runs, confirm what happened in plain, friendly language, including " +
  "the ID/reference number. " +
  "update_quotation can now edit any section of an existing quotation — terms, scope of work, " +
  "deliverables, technology used, timeline description, payment terms, project title/description, " +
  "and custom sections — not just status/client/items. When the user asks to change, lengthen, or " +
  "add to any of these (e.g. '20 lines of terms and conditions'), call update_quotation with the " +
  "full replacement content for that field — never claim you updated something without calling " +
  "the tool with the actual new content. " +
  "If asked your name, say you're Nexa.";

const MAX_TOOL_ROUNDS = 4;

// Detects the "![image](data:...)\n<text>" format the frontend saves for
// image messages. Returns { imageDataUrl, text }. If there's no image,
// imageDataUrl is null and text is the original content unchanged.
function parseImageContent(content) {
  const match = /^!\[image\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)\n?([\s\S]*)$/.exec(content || "");
  if (!match) return { imageDataUrl: null, text: content || "" };
  return { imageDataUrl: match[1], text: match[2] || "" };
}

// ── Tool schemas Gemini sees ─────────────────────────────
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search_customers",
        description: "Find existing customers by name/company to get their ID before creating, editing, or deleting a customer, quotation, or invoice.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Customer name or company name to search for" },
          },
          required: ["query"],
        },
      },
      {
        name: "create_customer",
        description: "Create a new customer record. Only call this if search_customers found no match.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            company: { type: "STRING" },
            email: { type: "STRING" },
            phone: { type: "STRING" },
            address: { type: "STRING" },
            city: { type: "STRING" },
            gstNumber: { type: "STRING" },
          },
          required: ["name"],
        },
      },
      {
        name: "update_customer",
        description: "Edit fields on an existing customer. Only send the fields that are changing.",
        parameters: {
          type: "OBJECT",
          properties: {
            customerId: { type: "STRING", description: "ID of the customer to edit, from search_customers" },
            name: { type: "STRING" },
            company: { type: "STRING" },
            email: { type: "STRING" },
            phone: { type: "STRING" },
            city: { type: "STRING" },
            gstNumber: { type: "STRING" },
            status: { type: "STRING" },
          },
          required: ["customerId"],
        },
      },
      {
        name: "delete_customer",
        description: "Permanently delete a customer record.",
        parameters: {
          type: "OBJECT",
          properties: {
            customerId: { type: "STRING", description: "ID of the customer to delete, from search_customers" },
          },
          required: ["customerId"],
        },
      },
      {
        name: "create_quotation",
        description: "Create a full, template-complete quotation for an existing customer. Always call search_customers first and pass the resulting customerId — never invent one.",
        parameters: {
          type: "OBJECT",
          properties: {
            customerId: { type: "STRING", description: "ID of an existing customer, from search_customers or create_customer" },
            templateId: {
              type: "STRING",
              description: "Which quotation template style to use. One of: proj-custom, proj-classic, proj-creative, proj-elegant, proj-modern, proj-minimal, proj-corporate. Omit this field entirely (or use proj-custom) if the user didn't ask for a particular visual style — the plain 'Customize Your Own' layout will be used by default.",
            },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  description: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unitPrice: { type: "NUMBER" },
                },
                required: ["description", "quantity", "unitPrice"],
              },
            },
            projectTitle: { type: "STRING" },
            description: { type: "STRING", description: "A 1–2 sentence project description summarizing what this quotation covers, written for the client (e.g. 'This proposal covers the design and development of a responsive company website with 5 pages and a contact form.')." },
                scopeOfWork: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Scope items, one per array entry, tailored specifically to this project (e.g. for an ecommerce site: product listing pages, cart & checkout, payment gateway integration, order management — NOT generic boilerplate).",
      },
      deliverables: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Deliverables, one per array entry, specific to what this project will hand over to the client.",
      },
      technologyUsed: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Technology/stack items, one per array entry, matching what's actually appropriate for this project.",
      },
      timelineDesc: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Timeline/process notes, one per array entry, describing how this specific project will be delivered.",
      },
            notes: { type: "STRING" },
              customSections: {
        type: "ARRAY",
        description:
          "Extra sections beyond the standard ones, used to add depth, structure, and length to a " +
          "quotation. Use several of these whenever the user asks for a long, detailed, or multi-page " +
          "quotation, or when the project has a natural feature/module list, package pricing, or a " +
          "phased plan that reads better as a table than a paragraph. Good section titles: Project " +
          "Objectives, Target Platforms, Customer-Side Features, Admin & Management Features, " +
          "Design & UX Scope, Core Pages, Payment & Delivery Integrations, Package Pricing, Project " +
          "Timeline & Support, Additional Terms, Final Summary & Approval.",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            type: {
              type: "STRING",
              description: "'paragraph' for a plain text section (default), or 'table' when the content is naturally rows of data (feature lists, package pricing, phased timelines).",
            },
            content: { type: "STRING", description: "Used when type is 'paragraph' (or omitted). Full paragraph text for this section." },
            columns: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "Used when type is 'table'. Column headers, e.g. ['Feature', 'Description'] or ['Package', 'Price', 'Scope'].",
            },
            rows: {
              type: "ARRAY",
              items: { type: "ARRAY", items: { type: "STRING" } },
              description: "Used when type is 'table'. Each inner array is one row, with one string per column, in the same order as 'columns'.",
            },
          },
          required: ["title"],
        },
      },
          },
          required: ["customerId", "items", "description", "scopeOfWork", "deliverables", "technologyUsed", "timelineDesc"],
        },
      },

      {
        name: "search_quotations",
        description: "Find quotations by customer name, company, or quotation ID/number, to get the exact ID before editing/deleting.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Customer name, company, or quotation number like QT-0004" },
          },
          required: ["query"],
        },
      },
        {
        name: "update_quotation",
description: "Edit fields on an existing quotation — status, client details, items, GST/tax settings, or any of its content sections (terms, scope of work, deliverables, technology, timeline description, payment terms, project title/description, and custom sections). Only send the fields that are changing. If items are provided (or includeGst/gstPercent changes), the total is recalculated.",        parameters: {
          type: "OBJECT",
          properties: {
            quotationId: { type: "STRING", description: "ID of the quotation to edit, from search_quotations" },
            status: { type: "STRING", description: "e.g. Draft, Sent, Accepted, Rejected" },
                 includeGst: { type: "BOOLEAN", description: "Set to false to remove GST/tax entirely from this quotation's total. Set to true to include it." },
      gstPercent: { type: "NUMBER", description: "GST percentage to apply, if includeGst is true. Only send this if the user is asking to change the GST rate." },

            name: { type: "STRING", description: "Client contact person's name" },
            company: { type: "STRING", description: "Client company name" },
            email: { type: "STRING" },
            phone: { type: "STRING" },
            clientAddress: { type: "STRING", description: "Client address, including city/place" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  description: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unitPrice: { type: "NUMBER" },
                },
                required: ["description", "quantity", "unitPrice"],
              },
            },
            notes: { type: "STRING" },
            validUntil: { type: "STRING", description: "YYYY-MM-DD" },
            projectTitle: { type: "STRING" },
            description: { type: "STRING", description: "The project description shown near the top of the quotation." },
            scopeOfWork: { type: "ARRAY", items: { type: "STRING" }, description: "Full replacement list of scope items, one per array entry." },
            deliverables: { type: "ARRAY", items: { type: "STRING" }, description: "Full replacement list of deliverables, one per array entry." },
            technologyUsed: { type: "ARRAY", items: { type: "STRING" }, description: "Full replacement list of technology/stack items, one per array entry." },
            timelineDesc: { type: "ARRAY", items: { type: "STRING" }, description: "Full replacement list of timeline/process notes, one per array entry." },
            paymentTerms: { type: "STRING", description: "Payment terms text (use \\n between lines)." },
            terms: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "Full replacement list of Terms & Conditions lines, one per array entry. When the user asks for more/longer/N-line terms, write that many distinct, professional line items here — this fully replaces the existing terms.",
            },
            customSections: {
              type: "ARRAY",
              description: "Full replacement list of extra sections beyond the standard ones. Only send this if the user is asking to change custom sections — omitting it leaves existing custom sections untouched.",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  type: { type: "STRING", description: "'paragraph' (default) or 'table'." },
                  content: { type: "STRING" },
                  columns: { type: "ARRAY", items: { type: "STRING" } },
                  rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
                },
                required: ["title"],
              },
            },
          },
          required: ["quotationId"],
        },
      },
      {
        name: "delete_quotation",
        description: "Permanently delete a quotation.",
        parameters: {
          type: "OBJECT",
          properties: {
            quotationId: { type: "STRING", description: "ID of the quotation to delete, from search_quotations" },
          },
          required: ["quotationId"],
        },
      },
      {
        name: "get_quotation_stats",
        description: "Get exact counts of quotations grouped by status (Draft, Sent, Accepted/Approved, Rejected, Expired), and the total count. Always use this for any question about how many quotations exist, or how many are in a given status — never estimate or guess these numbers.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "create_invoice",
        description: "Create a new invoice or proforma invoice for a customer with line items.",
        parameters: {
          type: "OBJECT",
          properties: {
            buyerName: { type: "STRING" },
            buyerCompanyName: { type: "STRING" },
            buyerAddress: { type: "STRING" },
            buyerMobile: { type: "STRING" },
            buyerGSTIN: { type: "STRING" },
            type: {
              type: "STRING",
              description: "'Final' for a regular invoice (INV- numbering) or 'Proforma' for a proforma invoice (PI- numbering). Defaults to 'Final' if the user doesn't say 'proforma'.",
            },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  description: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unitPrice: { type: "NUMBER" },
                },
                required: ["description", "quantity", "unitPrice"],
              },
            },
            dueDate: { type: "STRING", description: "YYYY-MM-DD" },
            fromQuotationId: { type: "STRING", description: "If converting an existing quotation to an invoice" },
          },
          required: ["buyerName", "items"],
        },
      },
      {
        name: "search_invoices",
        description: "Find invoices by buyer name, company, or invoice number, to get the exact ID before editing/deleting.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Buyer name, company, or invoice number like INV-172..." },
          },
          required: ["query"],
        },
      },
      {
        name: "update_invoice",
        description: "Edit fields on an existing invoice, such as status, amount paid, items, or due date. Only send the fields that are changing. If items are provided, they fully replace the existing item list and the total is recalculated.",
        parameters: {
          type: "OBJECT",
          properties: {
            invoiceId: { type: "STRING", description: "ID of the invoice to edit, from search_invoices" },
            status: { type: "STRING", description: "e.g. Unpaid, Paid, Partially Paid, Overdue" },
            amountPaid: { type: "NUMBER" },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  description: { type: "STRING" },
                  quantity: { type: "NUMBER" },
                  unitPrice: { type: "NUMBER" },
                },
                required: ["description", "quantity", "unitPrice"],
              },
            },
            dueDate: { type: "STRING", description: "YYYY-MM-DD" },
            notes: { type: "STRING" },
          },
          required: ["invoiceId"],
        },
      },
      {
        name: "delete_invoice",
        description: "Permanently delete an invoice.",
        parameters: {
          type: "OBJECT",
          properties: {
            invoiceId: { type: "STRING", description: "ID of the invoice to delete, from search_invoices" },
          },
          required: ["invoiceId"],
        },
      },
    ],
  },
];

function calcTotal(items = []) {
  return items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
}

// Accepts either a real array of lines (preferred, from the updated
// ARRAY-typed tool schema) or a legacy string. If a string still contains
// literal "\n" as two characters (backslash + n) instead of a real
// newline — which happens when a model writes the escape sequence as
// text rather than an actual line break — this converts it back into
// real newlines before joining, so old/malformed model output still
// renders correctly instead of showing the literal "\n" in the UI.
function joinLines(value) {
  if (Array.isArray(value)) {
    return value.map((line) => String(line).trim()).filter(Boolean).join("\n");
  }
  if (typeof value === "string") {
    return value.replace(/\\n/g, "\n").trim();
  }
  return "";
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Fallback used only if the AI omits `description` on create_quotation —
// mirrors the placeholder text MinimalLayout.jsx shows for manually
// created quotations, so an AI-generated one never ends up with a blank
// Project Description block.
function buildFallbackDescription(customer, companyRow, items = []) {
  const issuer = companyRow?.company_name || "our company";
  const client = customer?.company || customer?.name || "the client";
  const workSummary = items.map((i) => i.description).filter(Boolean).join(", ");
  return workSummary
    ? `This proposal outlines the scope of work agreed upon between ${issuer} and ${client}, covering ${workSummary}.`
    : `This proposal outlines the scope of work agreed upon between ${issuer} and ${client}.`;
}
// Mirrors the numbering logic in InvoicesPage.jsx (openDraftFromCustomer /
// openDraftFromQuotation): max existing number for that series + 1, padded
// to 3 digits. Final and Proforma are separate series, distinguished only
// by invoiceNo prefix (invoice_type isn't persisted in the invoices table).
async function reserveNextInvoiceNumber(type) {
  const settings = await settingsModel.getInvoiceSettings();
  const prefix = type === "Proforma"
    ? (settings?.proforma_prefix || "PI-")
    : (settings?.invoice_prefix || "INV-");

  const all = await invoiceModel.getAllInvoices();
  const sameSeries = all.filter((i) => (i.invoice_no || "").startsWith(prefix));
  const numbers = sameSeries.map((i) => parseInt((i.invoice_no || "").match(/(\d+)$/)?.[1] || "0", 10));
  const nextNum = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `${prefix}${String(nextNum).padStart(3, "0")}`;
}
// Mirrors generateId() in CustomerForm.jsx: max existing CUST-xxx number + 1.
// Ignores any customer whose id isn't in the CUST-xxx format (e.g. legacy
// UUID-based records) so they can't poison the max() calculation with NaN.
async function reserveNextCustomerId() {
  const all = await customerModel.getAllCustomers();
  const numbers = all
    .filter((c) => (c.id || "").startsWith("CUST-"))
    .map((c) => parseInt(c.id.slice(5), 10))
    .filter((n) => !Number.isNaN(n));
  const nextNum = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `CUST-${String(nextNum).padStart(3, "0")}`;
}

// Normalizes chat-supplied line items into the shape InvoiceDocument.jsx
// expects: { sl, description, qty, rate, amount } — NOT { quantity, unitPrice }
function toInvoiceItems(items = []) {
  return items.map((it, i) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.unitPrice) || 0;
    return {
      sl: i + 1,
      description: it.description || "",
      qty,
      rate,
      amount: qty * rate,
    };
  });
}

// ── Small lookup helpers ─────────────────────────────────
// None of the provided models expose getById, so we filter the full list.
// Fine for now; swap for a real WHERE id = $1 query if these tables grow large.
async function findCustomerById(id) {
  const all = await customerModel.getAllCustomers();
  return all.find((c) => c.id === id) || null;
}

async function findQuotationById(id) {
  const all = await quotationModel.getAllQuotations();
  return all.find((q) => q.id === id) || null;
}

async function findInvoiceById(id) {
  const all = await invoiceModel.getAllInvoices();
  return all.find((i) => i.id === id) || null;
}

// ── Dispatcher: runs the real DB call for whichever function Gemini picked ──
async function executeTool(name, args) {
  switch (name) {
    case "search_customers": {
      const all = await customerModel.getAllCustomers();
      const q = (args.query || "").toLowerCase();
      const matches = all
        .filter(
          (c) =>
            c.name?.toLowerCase().includes(q) ||
            c.company?.toLowerCase().includes(q)
        )
        .slice(0, 5);
      return { matches };
    }

    case "create_customer": {
      const customer = await customerModel.saveCustomer({
        id: await reserveNextCustomerId(),
        name: args.name,
        company: args.company || null,
        email: args.email || null,
        phone: args.phone || null,
        address: args.address || null,
        city: args.city || null,
        gstNumber: args.gstNumber || null,
        status: "Active",
      });
      return customer;
    }

    case "update_customer": {
      const existing = await findCustomerById(args.customerId);
      if (!existing) return { error: "Customer not found. Run search_customers again to confirm the ID." };

      const merged = {
        ...existing,
        name: args.name ?? existing.name,
        company: args.company ?? existing.company,
        email: args.email ?? existing.email,
        phone: args.phone ?? existing.phone,
        city: args.city ?? existing.city,
        gstNumber: args.gstNumber ?? existing.gst_number,
        status: args.status ?? existing.status,
      };
      const customer = await customerModel.saveCustomer(merged);
      return customer;
    }

    case "delete_customer": {
      const existing = await findCustomerById(args.customerId);
      if (!existing) return { error: "Customer not found. Run search_customers again to confirm the ID." };
      await customerModel.deleteCustomer(args.customerId);
      return { deleted: true, customerId: args.customerId, name: existing.name };
    }

    case "create_quotation": {
      const customer = await findCustomerById(args.customerId);
      if (!customer) {
        return { error: "Customer not found. Run search_customers again to confirm the ID." };
      }
      if (!args.items || args.items.length === 0) {
        return { error: "At least one line item (description, quantity, unitPrice) is required." };
      }

      const [companyRow, invoiceSettingsRow] = await Promise.all([
        settingsModel.getCompanySettings(),
        settingsModel.getInvoiceSettings(),
      ]);

      const template = getTemplate(args.templateId);

      const items = args.items.map((it) => {
        const qty = Number(it.quantity) || 0;
        const rate = Number(it.unitPrice) || 0;
        return { description: it.description || "", qty, rate, total: qty * rate };
      });
      const subtotal = items.reduce((sum, i) => sum + i.total, 0);
      const gstPercent = invoiceSettingsRow?.gst_percent ?? 18;
      const tax = Math.round(subtotal * (gstPercent / 100));
      const total = subtotal + tax;

      const quotation = await quotationModel.saveQuotation(
        {
          name: customer.name,
          company: customer.company || null,
          email: customer.email || null,
          phone: customer.phone || null,
          date: new Date().toISOString().slice(0, 10),
          validUntil: addDays(30),
          status: "Draft",
          amount: total,
          timeline: template.timeline,
              description: args.description?.trim() || buildFallbackDescription(customer, companyRow, args.items),
      scopeOfWork: joinLines(args.scopeOfWork) || STANDARD_SCOPE_OF_WORK,
      deliverables: joinLines(args.deliverables) || STANDARD_DELIVERABLES,
      technologyUsed: joinLines(args.technologyUsed) || STANDARD_TECHNOLOGY,
      timelineDesc: joinLines(args.timelineDesc) || STANDARD_TIMELINE_DESC,
          projectCost: `Project Cost: ₹${subtotal.toLocaleString()}\nGST (${gstPercent}%): ₹${tax.toLocaleString()}\nTotal Project Cost: ₹${total.toLocaleString()}`,
          paymentTerms: invoiceSettingsRow?.default_payment_terms || STANDARD_PAYMENT_TERMS,
          terms: STANDARD_TERMS,
          items,
                   customSections: (args.customSections || []).map((s) => {
        const title = (s.title || "").replace(/\\n/g, "\n").trim();
        if (s.type === "table") {
          return {
            title,
            type: "table",
            columns: Array.isArray(s.columns) ? s.columns.map((c) => String(c).trim()) : [],
            rows: Array.isArray(s.rows)
              ? s.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell).trim()) : []))
              : [],
          };
        }
        return {
          title,
          type: "paragraph",
          content: (s.content || "").replace(/\\n/g, "\n").trim(),
        };
      }),
          signature: "/signature.png",
          accentColor: null,
          accentBg: null,
          issuerName: companyRow?.company_name || "",
          issuerAddress: companyRow?.company_address || "",
          issuerPhone: companyRow?.company_phone || "",
          issuerEmail: companyRow?.company_email || "",
          issuerContact: null,
          projectTitle: args.projectTitle || "",
          clientAddress: [customer.address, customer.city].filter(Boolean).join(", ") || "", logo: companyRow?.logo || null,
          templateStyle: template.templateStyle,
          costItems: items.map((i) => ({ name: i.description, amount: i.total })),
          includeGst: true, gstPercent,
        },
        true
      );
      return quotation;
    }

    case "search_quotations": {
      const all = await quotationModel.getAllQuotations();
      const q = (args.query || "").toLowerCase();
      const matches = all
        .filter(
          (row) =>
            row.id?.toLowerCase().includes(q) ||
            row.name?.toLowerCase().includes(q) ||
            row.company?.toLowerCase().includes(q)
        )
        .slice(0, 5);
      return { matches };
    }

    case "update_quotation": {
  const existing = await findQuotationById(args.quotationId);
  if (!existing) return { error: "Quotation not found. Run search_quotations again to confirm the ID." };

  const includeGst = args.includeGst ?? existing.include_gst ?? true;
  const gstPercent = args.gstPercent ?? existing.gst_percent ?? 18;

  let items = existing.items;
  let amount = Number(existing.amount);
  let projectCost = existing.project_cost;

  // Recalculate whenever items change, OR the GST setting/rate changes —
  // previously this only ran when items were resent, so toggling GST
  // alone (without touching items) silently did nothing.
  if (args.items || args.includeGst !== undefined || args.gstPercent !== undefined) {
    items = args.items
      ? args.items.map((it) => {
          const qty = Number(it.quantity) || 0;
          const rate = Number(it.unitPrice) || 0;
          return { description: it.description || "", qty, rate, total: qty * rate };
        })
      : existing.items;

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const tax = includeGst ? Math.round(subtotal * (gstPercent / 100)) : 0;
    amount = subtotal + tax;
    projectCost = includeGst
      ? `Project Cost: ₹${subtotal.toLocaleString()}\nGST (${gstPercent}%): ₹${tax.toLocaleString()}\nTotal Project Cost: ₹${amount.toLocaleString()}`
      : `Project Cost: ₹${subtotal.toLocaleString()}\nTotal Project Cost: ₹${amount.toLocaleString()}`;
  }

         const merged = {
        id: existing.id,
        name: args.name ?? existing.name,
        company: args.company ?? existing.company,
        email: args.email ?? existing.email,
        phone: args.phone ?? existing.phone,
        date: existing.date,
        validUntil: args.validUntil ?? existing.valid_until,
        status: args.status ?? existing.status,
        amount,
        timeline: existing.timeline,
        description: args.description?.trim() || existing.description,
        scopeOfWork: args.scopeOfWork ? joinLines(args.scopeOfWork) : existing.scope_of_work,
        deliverables: args.deliverables ? joinLines(args.deliverables) : existing.deliverables,
        technologyUsed: args.technologyUsed ? joinLines(args.technologyUsed) : existing.technology_used,
        timelineDesc: args.timelineDesc ? joinLines(args.timelineDesc) : existing.timeline_desc,
        projectCost,
        paymentTerms: args.paymentTerms?.trim() || existing.payment_terms,
        terms: args.terms ? joinLines(args.terms) : existing.terms,
        notes: args.notes ?? existing.notes,
        items,
        customSections: args.customSections
          ? args.customSections.map((s) => {
              const title = (s.title || "").replace(/\\n/g, "\n").trim();
              if (s.type === "table") {
                return {
                  title,
                  type: "table",
                  columns: Array.isArray(s.columns) ? s.columns.map((c) => String(c).trim()) : [],
                  rows: Array.isArray(s.rows)
                    ? s.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell).trim()) : []))
                    : [],
                };
              }
              return { title, type: "paragraph", content: (s.content || "").replace(/\\n/g, "\n").trim() };
            })
          : existing.custom_sections,
        signature: existing.signature,
        accentColor: existing.accent_color,
        accentBg: existing.accent_bg,
        issuerName: existing.issuer_name,
        issuerAddress: existing.issuer_address,
        issuerPhone: existing.issuer_phone,
        issuerEmail: existing.issuer_email,
        issuerContact: existing.issuer_contact,
        projectTitle: args.projectTitle ?? existing.project_title,
        clientAddress: args.clientAddress ?? existing.client_address,
        logo: existing.logo,
        templateStyle: existing.template_style,
        costItems: items.map((i) => ({ name: i.description, amount: i.total })),
        includeGst,
        gstPercent,
      };
      // isNew=false -> keeps the same QT-xxxx id/number, does not reserve a new one
      const quotation = await quotationModel.saveQuotation(merged, false);
      return quotation;
    }

    case "delete_quotation": {
      const existing = await findQuotationById(args.quotationId);
      if (!existing) return { error: "Quotation not found. Run search_quotations again to confirm the ID." };
      await quotationModel.deleteQuotation(args.quotationId);
      return { deleted: true, quotationId: args.quotationId };
    }

    case "get_quotation_stats": {
      const all = await quotationModel.getAllQuotations();
      const counts = {};
      for (const q of all) {
        const status = q.status || "Unknown";
        counts[status] = (counts[status] || 0) + 1;
      }
      return { total: all.length, byStatus: counts };
    }
    case "create_invoice": {
      const normalizedItems = toInvoiceItems(args.items);
      const total = normalizedItems.reduce((sum, i) => sum + i.amount, 0);
      const type = args.type === "Proforma" ? "Proforma" : "Final";
      const invoiceNo = await reserveNextInvoiceNumber(type);

      const [invoiceSettings, companyRow] = await Promise.all([
        settingsModel.getInvoiceSettings(),
        settingsModel.getCompanySettings(),
      ]);

      const invoice = await invoiceModel.saveInvoice({
        id: crypto.randomUUID(),
        invoiceNo,
        buyerName: args.buyerName,
        buyerCompanyName: args.buyerCompanyName || null,
        buyerAddress: args.buyerAddress || null,
        buyerMobile: args.buyerMobile || null,
        buyerGSTIN: args.buyerGSTIN || null,
        date: new Date().toISOString().slice(0, 10),
        dueDate: args.dueDate || null,
        status: "Unpaid",
        gstType: "With GST",
        gstPercent: invoiceSettings?.gst_percent ?? 18,
        items: normalizedItems,
        amountPaid: 0,
        total,
        amountDue: total,
        notes: invoiceSettings?.default_notes || null,
        companyName: companyRow?.company_name || null,
        companyAddress: companyRow?.company_address || null,
        companyGSTIN: companyRow?.gstin || null,
        logo: companyRow?.logo || null,
        // Uses the actual signature file that exists in /public — was
        // previously "/default-signature.png", a file that doesn't exist,
        // which is why AI-created invoices were showing no signature.
        signature: "/signature.png",
        fromQuotationId: args.fromQuotationId || null,
      });
      return invoice;
    }

    case "search_invoices": {
      const all = await invoiceModel.getAllInvoices();
      const q = (args.query || "").toLowerCase();
      const matches = all
        .filter(
          (row) =>
            row.invoice_no?.toLowerCase().includes(q) ||
            row.buyer_name?.toLowerCase().includes(q) ||
            row.buyer_company_name?.toLowerCase().includes(q)
        )
        .slice(0, 5);
      return { matches };
    }

    case "update_invoice": {
      const existing = await findInvoiceById(args.invoiceId);
      if (!existing) return { error: "Invoice not found. Run search_invoices again to confirm the ID." };

      const normalizedItems = args.items ? toInvoiceItems(args.items) : existing.items;
      const total = args.items
        ? normalizedItems.reduce((sum, i) => sum + i.amount, 0)
        : Number(existing.total);
      const amountPaid = args.amountPaid ?? Number(existing.amount_paid);

      const merged = {
        id: existing.id,
        invoiceNo: existing.invoice_no,
        buyerName: existing.buyer_name,
        buyerCompanyName: existing.buyer_company_name,
        buyerAddress: existing.buyer_address,
        buyerMobile: existing.buyer_mobile,
        buyerGSTIN: existing.buyer_gstin,
        date: existing.date,
        dueDate: args.dueDate ?? existing.due_date,
        status: args.status ?? existing.status,
        gstType: existing.gst_type,
        gstPercent: existing.gst_percent,
        items: normalizedItems,
        amountPaid,
        total,
        amountDue: total - amountPaid,
        notes: args.notes ?? existing.notes,
        signature: existing.signature,
        companyName: existing.company_name,
        companyAddress: existing.company_address,
        companyGSTIN: existing.company_gstin,
        logo: existing.logo,
        fromQuotationId: existing.from_quotation_id,
      };
      const invoice = await invoiceModel.saveInvoice(merged);
      return invoice;
    }

    case "delete_invoice": {
      const existing = await findInvoiceById(args.invoiceId);
      if (!existing) return { error: "Invoice not found. Run search_invoices again to confirm the ID." };
      await invoiceModel.deleteInvoice(args.invoiceId);
      return { deleted: true, invoiceId: args.invoiceId, invoiceNo: existing.invoice_no };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Retry helper for transient 429/503 ───────────────────
async function generateWithRetry(params, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503;
      if (!isRetryable || i === retries) throw err;
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }
}

function generateTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 40 ? clean : clean.slice(0, 40).trim() + "…";
}

function getUserId(request) {
  return request.user?.id ?? null;
}

// Builds the Gemini `contents` array from a chat's saved messages and runs
// the tool-calling loop until a plain text reply comes back, then saves and
// returns that assistant message. Shared by sendMessage (new message) and
// editMessage (regenerating after an edit), so the two flows can never
// drift apart.
async function generateAssistantReply(chatId) {
  const history = await chatModel.getMessages(chatId);
  const lastIndex = history.length - 1;

  let contents = history.map((m, idx) => {
    const { imageDataUrl, text: msgText } = parseImageContent(m.content);

    // Only the message just sent/edited gets its actual image bytes handed
    // to Gemini (so it can "see" it). Older image messages in history are
    // replaced with a lightweight placeholder so every follow-up message
    // doesn't resend the full image data as tokens.
    if (imageDataUrl && idx === lastIndex && m.role === "user") {
      const [, mimeType, base64Data] = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/) || [];
      return {
        role: "user",
        parts: [
          ...(msgText ? [{ text: msgText }] : []),
          { inlineData: { mimeType, data: base64Data } },
        ],
      };
    }
    if (imageDataUrl) {
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: (msgText ? msgText + "\n" : "") + "[Image attached]" }],
      };
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    };
  });

  let replyText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await generateWithRetry({
      model: "gemini-flash-lite-latest",
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 4000,
        tools: TOOLS,
      },
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCallPart = parts.find((p) => p.functionCall);

    if (!functionCallPart) {
      replyText = response.text || "";
      break;
    }

    const { name, args } = functionCallPart.functionCall;
    let toolResult;
    try {
      toolResult = await executeTool(name, args);
    } catch (err) {
      toolResult = { error: err.message };
    }

    contents.push({ role: "model", parts: [functionCallPart] });
    contents.push({
      role: "user",
      parts: [{ functionResponse: { name, response: toolResult } }],
    });
  }

  if (!replyText) {
    replyText = "Done — let me know if you'd like anything else.";
  }

  return chatModel.addMessage(chatId, "assistant", replyText);
}

export async function createChat(request, reply) {
  const userId = getUserId(request);
  const chat = await chatModel.createChat(userId, "New Chat");
  return reply.code(201).send(chat);
}

export async function listChats(request, reply) {
  const userId = getUserId(request);
  const chats = await chatModel.listChats(userId);
  return reply.send(chats);
}

export async function getChat(request, reply) {
  const userId = getUserId(request);
  const { chatId } = request.params;
  const chat = await chatModel.getChatById(chatId, userId);
  if (!chat) return reply.code(404).send({ error: "Chat not found" });
  const messages = await chatModel.getMessages(chatId);
  return reply.send({ ...chat, messages });
}

export async function renameChat(request, reply) {
  const userId = getUserId(request);
  const { chatId } = request.params;
  const { title } = request.body;
  if (!title || !title.trim()) {
    return reply.code(400).send({ error: "title is required" });
  }
  const chat = await chatModel.renameChat(chatId, title.trim(), userId);
  if (!chat) return reply.code(404).send({ error: "Chat not found" });
  return reply.send(chat);
}

export async function deleteChat(request, reply) {
  const userId = getUserId(request);
  const { chatId } = request.params;
  const deleted = await chatModel.deleteChat(chatId, userId);
  if (!deleted) return reply.code(404).send({ error: "Chat not found" });
  return reply.code(204).send();
}

export async function sendMessage(request, reply) {
  const userId = getUserId(request);
  const { chatId } = request.params;
  const { content, image } = request.body;
  const text = (content || "").trim();

  if (!text && !image) {
    return reply.code(400).send({ error: "content or image is required" });
  }

  const chat = await chatModel.getChatById(chatId, userId);
  if (!chat) return reply.code(404).send({ error: "Chat not found" });

  try {
    const priorCount = await chatModel.countMessages(chatId);
    // Images are embedded as a markdown-style prefix in the same content
    // column that already stores plain text — no DB schema change needed.
    const savedContent = image ? `![image](${image})\n${text}` : text;
    const userMessage = await chatModel.addMessage(chatId, "user", savedContent);

    const assistantMessage = await generateAssistantReply(chatId);

    let updatedChat = chat;
    if (priorCount === 0) {
      updatedChat = await chatModel.renameChat(chatId, generateTitle(text || "Image"), userId);
    }

    return reply.send({ chat: updatedChat, userMessage, assistantMessage });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: "Failed to get a response" });
  }
}

// Overwrites an existing user message and regenerates the AI's reply from
// that point — the old reply (and anything sent after it) is discarded,
// since it was a response to the version of the message that no longer
// exists.
export async function editMessage(request, reply) {
  const userId = getUserId(request);
  const { chatId, messageId } = request.params;
  const { content, image } = request.body;
  const text = (content || "").trim();

  if (!text && !image) {
    return reply.code(400).send({ error: "content or image is required" });
  }

  const chat = await chatModel.getChatById(chatId, userId);
  if (!chat) return reply.code(404).send({ error: "Chat not found" });

  const existingMessage = await chatModel.getMessageById(messageId);
  if (!existingMessage || String(existingMessage.chat_id) !== String(chatId)) {
    return reply.code(404).send({ error: "Message not found in this chat" });
  }
  if (existingMessage.role !== "user") {
    return reply.code(400).send({ error: "Only your own messages can be edited" });
  }

  try {
    const savedContent = image ? `![image](${image})\n${text}` : text;
    const userMessage = await chatModel.updateMessageContent(messageId, savedContent);

    // Rewind the conversation: drop the old AI reply and anything after it.
    await chatModel.deleteMessagesAfter(chatId, messageId);

    const assistantMessage = await generateAssistantReply(chatId);

    return reply.send({ chat, userMessage, assistantMessage });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: "Failed to get a response" });
  }
}