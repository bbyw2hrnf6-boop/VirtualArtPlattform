export type AuraMailBrand = {
  name: string;
  appUrl: string;
  replyTo: string;
  legalFooter: string;
};

export type AuraMail = {
  subject: string;
  text: string;
  html: string;
};

const PLACEHOLDER = /(?:change[-_ ]?me|example\.(?:com|org|net)|invalid\.example|not[-_ ]?configured|placeholder|replace[-_ ]?me|todo|xxxxx)/i;

export function assertAuraMailBrandConfigured(brand: AuraMailBrand) {
  if (brand.name !== "LIEUVA") throw new Error("Mail brand name is invalid.");

  let appUrl: URL;
  try {
    appUrl = new URL(brand.appUrl);
  } catch {
    throw new Error("Mail public URL is invalid.");
  }
  if (
    brand.appUrl !== brand.appUrl.trim()
    || appUrl.protocol !== "https:"
    || appUrl.username
    || appUrl.password
    || appUrl.pathname !== "/"
    || appUrl.search
    || appUrl.hash
    || appUrl.hostname === "localhost"
    || appUrl.hostname.endsWith(".local")
  ) throw new Error("Mail public URL is invalid.");

  if (
    brand.replyTo !== brand.replyTo.trim()
    || brand.replyTo.length > 254
    || !/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(brand.replyTo)
    || PLACEHOLDER.test(brand.replyTo)
  ) throw new Error("Mail reply-to address is invalid.");

  if (
    brand.legalFooter !== brand.legalFooter.trim()
    || brand.legalFooter.length < 20
    || brand.legalFooter.length > 500
    || PLACEHOLDER.test(brand.legalFooter)
  ) throw new Error("Mail legal footer is invalid.");
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);

const firstName = (displayName?: string) =>
  displayName?.trim().split(/\s+/)[0]?.slice(0, 40) || "there";

function emailShell({
  brand,
  preheader,
  eyebrow,
  title,
  intro,
  body,
  actionLabel,
  actionUrl,
  footerAction,
}: {
  brand: AuraMailBrand;
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  footerAction?: string;
}) {
  const safeReply = escapeHtml(brand.replyTo);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#151613;color:#1b1c19;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#151613;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#efeee8;border-collapse:collapse">
<tr><td style="padding:28px 34px;border-bottom:1px solid #c9c9c1"><a href="${escapeHtml(brand.appUrl)}" style="color:#1b1c19;text-decoration:none"><span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border:1px solid #1b1c19;border-radius:50%;font-family:Georgia,serif;font-style:italic;font-size:18px">L</span><strong style="margin-left:12px;font-size:12px;letter-spacing:4px">${escapeHtml(brand.name)}</strong></a><span style="float:right;padding:8px 10px;background:#d9ff43;font-size:9px;letter-spacing:1.5px;text-transform:uppercase">Light preview</span></td></tr>
<tr><td style="padding:52px 34px 22px"><p style="margin:0 0 18px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b6d64">${escapeHtml(eyebrow)}</p><h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:52px;line-height:.98;font-weight:400;letter-spacing:-2px">${escapeHtml(title)}</h1><p style="max-width:520px;margin:28px 0 0;color:#5e6058;font-size:15px;line-height:1.7">${escapeHtml(intro)}</p></td></tr>
<tr><td style="padding:0 34px 24px">${body}</td></tr>
<tr><td style="padding:6px 34px 42px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:16px 22px;background:#1b1c19;color:#f4f3ed;text-decoration:none;font-size:11px;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(actionLabel)} &nbsp;↗</a><p style="margin:18px 0 0;color:#7b7d74;font-size:10px;line-height:1.6;word-break:break-all">If the button does not work: <a href="${escapeHtml(actionUrl)}" style="color:#42443e">${escapeHtml(actionUrl)}</a></p></td></tr>
<tr><td style="padding:26px 34px;background:#deddd6;color:#686a62;font-size:10px;line-height:1.7"><p style="margin:0 0 6px">${footerAction ?? ""}</p><p style="margin:0">${escapeHtml(brand.legalFooter)} · <a href="mailto:${safeReply}" style="color:#4f514a">${safeReply}</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

export function verificationMail(
  brand: AuraMailBrand,
  input: { displayName?: string; verificationUrl: string },
): AuraMail {
  const name = firstName(input.displayName);
  const subject = `One click. Your ${brand.name} Space is ready.`;
  const text = `Hi ${name},\n\nVerify your email to secure your ${brand.name} Projects and use account preview access.\n\nVerify email: ${input.verificationUrl}\n\n${brand.name} is currently a free preview. Paid plans and additional professional tools are planned, but billing is not active.\n\nData & rights: ${brand.appUrl}/#/data\nContact: ${brand.replyTo}\n${brand.legalFooter}`;
  const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #c9c9c1;border-bottom:1px solid #c9c9c1"><tr><td style="padding:20px 0"><strong style="font-family:Georgia,serif;font-size:22px;font-weight:400">Why verify?</strong><p style="margin:9px 0 0;color:#676960;font-size:12px;line-height:1.7">Keep Projects attached to one identity, publish public, unlisted, or private Spaces, and return to update the same live Space later.</p></td></tr></table>`;
  return {
    subject,
    text,
    html: emailShell({
      brand,
      preheader: `Verify your email and return to your ${brand.name} Projects.`,
      eyebrow: `Welcome, ${name}`,
      title: "Your space starts here.",
      intro: "Confirm this email address to keep control of your Projects and unlock account preview access.",
      body,
      actionLabel: "Verify email",
      actionUrl: input.verificationUrl,
      footerAction: `This transactional email was requested for a ${escapeHtml(brand.name)} account. Data & rights: <a href="${escapeHtml(brand.appUrl)}/#/data" style="color:#4f514a">open notice</a>.`,
    }),
  };
}

export function welcomeMail(
  brand: AuraMailBrand,
  input: { displayName?: string; unsubscribeUrl: string },
): AuraMail {
  const name = firstName(input.displayName);
  const createUrl = `${brand.appUrl}/#/create`;
  const demoUrl = `${brand.appUrl}/#/demo`;
  const subject = `The ${brand.name} Preview Letter — give your work a place`;
  const text = `Hi ${name},\n\nWelcome to the ${brand.name} Preview Letter.\n\nAVAILABLE NOW\n• Start with a White Cube, Nocturne, or Grand Forum Space template in the browser.\n• Arrange work, materials, light, and objects.\n• Walk, use Overview and Guided tour, then publish one shareable link.\n• Studio and Walk Preview need no account. Publishing uses a verified account with public, unlisted, or private access.\n\nPLANNED, NOT ACTIVE YET\nPaid plans may later add longer hosting, collaboration, custom domains, analytics, and managed support. Billing is not active.\n\nCreate: ${createUrl}\nExplore Threshold: ${demoUrl}\nData & rights: ${brand.appUrl}/#/data\nUnsubscribe: ${input.unsubscribeUrl}\nContact: ${brand.replyTo}\n${brand.legalFooter}`;
  const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #c9c9c1"><tr><td style="padding:22px 0;border-bottom:1px solid #c9c9c1"><p style="margin:0 0 7px;font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:#777970">Available now</p><strong style="font-family:Georgia,serif;font-size:24px;font-weight:400">Three templates. One link. Your point of view.</strong><p style="margin:10px 0 0;color:#676960;font-size:12px;line-height:1.7">Arrange work, tune materials and light, test the visitor route, and publish a Space that opens directly in the browser.</p></td></tr><tr><td style="padding:22px 0;border-bottom:1px solid #c9c9c1"><p style="margin:0 0 7px;font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:#777970">Reference experience</p><strong style="font-family:Georgia,serif;font-size:24px;font-weight:400">Enter Threshold.</strong><p style="margin:10px 0 0;color:#676960;font-size:12px;line-height:1.7">The Danny Hirsch Arts demo remains the quality reference for atmosphere, navigation, metadata, and guided storytelling. <a href="${escapeHtml(demoUrl)}" style="color:#33352f">Open demo →</a></p></td></tr><tr><td style="padding:22px 0"><p style="margin:0 0 7px;font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:#777970">Roadmap · planned</p><strong style="font-family:Georgia,serif;font-size:24px;font-weight:400">Professional tools, when ready.</strong><p style="margin:10px 0 0;color:#676960;font-size:12px;line-height:1.7">Longer hosting, collaboration, custom domains, analytics, and managed support are candidates for future paid plans. They are not active promises or paid features today.</p></td></tr></table>`;
  return {
    subject,
    text,
    html: emailShell({
      brand,
      preheader: `What ${brand.name} does today—and what is deliberately still ahead.`,
      eyebrow: `A letter for ${name}`,
      title: "Make the visit memorable.",
      intro: `${brand.name} is building a clearer way to turn work into a place people can enter, remember, and share.`,
      body,
      actionLabel: "Create a Space",
      actionUrl: createUrl,
      footerAction: `You opted in while using a ${escapeHtml(brand.name)} account. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#4f514a">Unsubscribe in one click</a> · <a href="${escapeHtml(brand.appUrl)}/#/data" style="color:#4f514a">Data & rights</a>.`,
    }),
  };
}
