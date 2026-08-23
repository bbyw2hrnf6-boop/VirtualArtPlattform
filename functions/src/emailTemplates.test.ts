import { describe, expect, it } from "vitest";
import { verificationMail, welcomeMail } from "./emailTemplates.js";

const brand = {
  name: "LIEUVA",
  appUrl: "https://aura.example",
  replyTo: "hello@aura.example",
  legalFooter: "LIEUVA Studio · Example Street 1 · Amsterdam",
};

describe("LIEUVA email templates", () => {
  it("renders a branded verification email with a fallback link", () => {
    const mail = verificationMail(brand, {
      displayName: "Danny Hirsch",
      verificationUrl: "https://auth.example/verify?code=123",
    });
    expect(mail.subject).toContain("LIEUVA");
    expect(mail.html).toContain("Verify email");
    expect(mail.html).toContain("https://auth.example/verify?code=123");
    expect(mail.html).toContain('href="https://aura.example"');
    expect(mail.html).toContain("Light preview");
    expect(mail.text).toContain("Data & rights");
  });

  it("labels roadmap items as planned and includes unsubscribe", () => {
    const mail = welcomeMail(brand, {
      displayName: "Danny Hirsch",
      unsubscribeUrl: "https://aura.example/unsubscribe/token",
    });
    expect(mail.text).toContain("PLANNED, NOT ACTIVE YET");
    expect(mail.html).toContain("Unsubscribe in one click");
    expect(mail.html).toContain("LIEUVA Studio · Example Street 1 · Amsterdam");
  });

  it("escapes user-controlled display names", () => {
    const mail = verificationMail(brand, {
      displayName: "<script>alert(1)</script>",
      verificationUrl: "https://auth.example/verify",
    });
    expect(mail.html).not.toContain("<script>alert(1)</script>");
  });
});
