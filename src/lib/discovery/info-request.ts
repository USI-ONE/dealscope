/**
 * Client info requests — which open questions a branch manager or office
 * contact can actually answer, and how to ask them in plain English.
 *
 * Anything technical (VLANs, spanning tree, GPOs…) stays with the tech;
 * these are the business facts people on site or in the back office know.
 */
import type { TemplateDef } from "./types";
import { sectionFields, type AnswerState } from "./templates";

export const CLIENT_QUESTIONS: Record<string, { prompt: string; hint?: string }> = {
  "wan.p_carrier": { prompt: "Who provides internet at this office?", hint: "e.g. AT&T, Cox, Windstream, Ritter — it’s usually on the bill or the modem" },
  "wan.p_account": { prompt: "What’s the internet account number?", hint: "On the monthly bill" },
  "wan.p_bandwidth": { prompt: "What internet speed do you pay for?", hint: "e.g. 300 Mbps down / 20 up — on the bill" },
  "wan.p_cost": { prompt: "Roughly what does internet cost per month?" },
  "wan.p_contract_end": { prompt: "When does the internet contract end?" },
  "wan.p_ips": { prompt: "Do you have any static IP addresses from your internet provider?", hint: "If you’re not sure, just say so" },
  "wan.s_carrier": { prompt: "Is there a second / backup internet connection? Who provides it?" },
  "wan.email_tenant": { prompt: "What do you use for email?" },
  "wan.dns_registrar": { prompt: "Who hosts your website / domain name?", hint: "e.g. GoDaddy, Network Solutions" },
  "voice.hosted_vendor": { prompt: "Who provides your phone service?", hint: "The company you pay for phones" },
  "voice.did": { prompt: "What’s the main phone number for this office?" },
  "voice.seats": { prompt: "How many desk phones are in use?" },
  "voice.sip_carrier": { prompt: "Who provides the phone lines (if different from the phone company)?" },
  "voice.porting_loa": { prompt: "Do you have a recent phone bill we could use to move your numbers?", hint: "Needed if numbers are transferred to a new provider" },
  "voice.fax_lines": { prompt: "Do you still need a fax line here?" },
  "voice.recording": { prompt: "Do you need calls recorded?" },
  "wireless.ssids": { prompt: "What are the Wi-Fi network names here?", hint: "List each one (staff, guest…)" },
  "wireless.ssid_auth": { prompt: "How do people connect to Wi-Fi?", hint: "Shared password, individual logins, guest page…" },
  "wireless.guest_cap": { prompt: "Do customers or visitors use a guest Wi-Fi?" },
  "alarms.monitoring_co": { prompt: "Which company monitors the alarm?" },
  "alarms.account": { prompt: "What’s the alarm account number?", hint: "On the alarm company’s bill or sticker" },
  "alarms.arming": { prompt: "When is the alarm armed, and who has the codes?" },
  "alarms.app": { prompt: "Is there a phone app for the alarm? Who uses it?" },
  "cameras.platform": { prompt: "What camera system do you use (brand or company)?" },
  "cameras.storage": { prompt: "How far back can you look at camera footage?" },
  "cameras.mobile_app": { prompt: "Who can view the cameras, and how (app, computer)?" },
  "cover.sqft": { prompt: "About how many square feet is the office?" },
  "cover.year_built": { prompt: "About what year was the building built?" },
  "cover.headcount_12mo": { prompt: "How many people do you expect to work here in 12 months?" },
  "cover.client_sponsor": { prompt: "Who should approve IT work for this office?", hint: "Name, phone and email" },
  "cover.landlord": { prompt: "If the building is leased, who is the landlord / property manager?" },
  "headcount.field": { prompt: "How many field technicians work out of this office?" },
  "headcount.visitors": { prompt: "About how many visitors or contractors come in each day?" },
  "headcount.hot_desk": { prompt: "Are there shared desks used by different people?" },
  "storage.backup_sw": { prompt: "Is anything backed up today? With what?" },
  "storage.shadow_it": { prompt: "Do staff keep files in Dropbox, Google Drive, USB drives or personal accounts?" },
  "identity.email_tenant": { prompt: "What do you use for email?" },
  "identity.password_manager": { prompt: "Do you use a password manager? Which one?" },
  "printers.label_printers": { prompt: "How many label printers are used here (and what for)?" },
  "printers.micr": { prompt: "Do you print or scan checks here? With what?" },
  "mdf.breaker_panel": { prompt: "Where is the electrical breaker panel?" },
  "facility.after_hours": { prompt: "How would our team get in after hours (keys, codes, who to call)?" },
};

export type RequestQuestion = { key: string; section: string; prompt: string; hint?: string; suggested: boolean };

/**
 * Open follow-ups on a walk that someone at the client could answer.
 * `suggested` = one we have plain-English wording for (pre-ticked).
 */
export function requestableQuestions(
  template: TemplateDef,
  answers: Map<string, AnswerState>,
  naSections: string[],
): RequestQuestion[] {
  const out: RequestQuestion[] = [];
  for (const s of template.sections) {
    if (naSections.includes(s.key)) continue;
    for (const f of sectionFields(s)) {
      if (["photo", "signature", "checklist"].includes(f.type)) continue;
      const a = answers.get(f.questionKey);
      if (!a || a.notApplicable || !a.value?.followUp) continue;
      const known = CLIENT_QUESTIONS[f.questionKey];
      out.push({
        key: f.questionKey,
        section: s.title,
        prompt: known?.prompt ?? f.label,
        hint: known?.hint ?? f.hint,
        suggested: !!known,
      });
    }
  }
  return out;
}

export const REQUEST_TTL_DAYS = 30;
