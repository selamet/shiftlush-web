/**
 * What a notification says, and where it leads.
 *
 * Run against the real catalogue, because the point is the sentence a person
 * reads — and that it matches the e-mail the server sent about the same event,
 * whose wording lives in shiftlush-api's templates/email/notification/kinds/.
 * The full sentences are asserted for that reason: a rewording here that the
 * e-mail does not share should fail, and be made in both places.
 */
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { AppNotification } from "@/api/queries";
import i18n from "@/lib/i18n";
import {
  badgeLabel,
  describeNotification,
  notificationTarget,
  relativeTime,
} from "@/lib/notifications";

const t = i18n.t as unknown as TFunction;

function notification(
  kind: string,
  data: Record<string, unknown>,
  subject: Partial<Pick<AppNotification, "subject_type" | "subject_id">> = {},
): AppNotification {
  return {
    id: "n1",
    kind: kind as AppNotification["kind"],
    subject_type: "contract",
    subject_id: "k1",
    data,
    read_at: null,
    created_at: "2026-10-20T06:00:00Z",
    ...subject,
  };
}

const contract = {
  contract_number: "2026-0043",
  customer_name: "Dadaş Konakları",
  end_date: "2026-11-30",
};

describe("describeNotification", () => {
  it("words a renewal that will happen by itself", () => {
    const words = describeNotification(
      notification("contract_renewal_due", { ...contract, auto_renew: true }),
      t,
    );
    expect(words).toEqual({
      title: "2026-0043 numaralı sözleşmenin süresi doluyor",
      body:
        "Dadaş Konakları ile yapılan 2026-0043 numaralı sözleşmenin süresi 30.11.2026 tarihinde doluyor. " +
        "Otomatik yenileme açık: sözleşme bu tarihte aynı koşullarla yenilenecek.",
      known: true,
    });
  });

  it("warns when nothing will renew it, and reads anything but true as off", () => {
    for (const autoRenew of [false, undefined, "true"]) {
      const { body } = describeNotification(
        notification("contract_renewal_due", { ...contract, auto_renew: autoRenew }),
        t,
      );
      expect(body).toContain("Otomatik yenileme kapalı");
    }
  });

  it("leaves the customer out when the server did not know it, as the e-mail does", () => {
    const { body } = describeNotification(
      notification("contract_expired", { contract_number: "2026-0043", end_date: "2026-10-19" }),
      t,
    );
    expect(body).toBe(
      "2026-0043 numaralı sözleşmenin süresi 19.10.2026 tarihinde doldu. Otomatik yenileme kapalı " +
        "olduğu için sözleşme sona erdi ve kapsadığı asansörler sözleşmesiz duruma geçti.",
    );
  });

  it("names the successor of an auto-renewed contract, and of a blocked one", () => {
    const renewed = describeNotification(
      notification("contract_auto_renewed", { ...contract, successor_contract_number: "2026-0101" }),
      t,
    );
    expect(renewed.title).toBe("2026-0043 numaralı sözleşme otomatik olarak yenilendi");
    expect(renewed.body).toContain("Yeni sözleşme 2026-0101 numarasıyla aynı koşullarda");

    const blocked = describeNotification(
      notification("contract_auto_renewal_blocked", {
        ...contract,
        successor_contract_number: "2026-0101",
      }),
      t,
    );
    expect(blocked.title).toBe("2026-0043 numaralı sözleşme otomatik olarak yenilenemedi");
    expect(blocked.body).toContain("KDV oranı tanımlı olmadığı için");
    expect(blocked.body).toContain("2026-0101 numarasıyla taslak olarak oluşturuldu");
  });

  it("words overdue maintenance with and without the building", () => {
    const withBuilding = describeNotification(
      notification(
        "maintenance_overdue",
        { elevator_name: "Sol asansör", building_name: "A Blok", next_maintenance_date: "2026-10-13" },
        { subject_type: "elevator", subject_id: "e1" },
      ),
      t,
    );
    expect(withBuilding).toEqual({
      title: "Sol asansör asansörünün bakımı gecikti",
      body: "Sol asansör (A Blok) asansörünün bakımı 13.10.2026 tarihinde yapılmalıydı.",
      known: true,
    });

    const without = describeNotification(
      notification("maintenance_overdue", {
        elevator_name: "Sol asansör",
        next_maintenance_date: "2026-10-13",
      }),
      t,
    );
    expect(without.body).toBe("Sol asansör asansörünün bakımı 13.10.2026 tarihinde yapılmalıydı.");
  });

  it("tells a technician how many visits they were given, and for which month", () => {
    const words = describeNotification(
      notification("visit_assigned", { period: "2026-11", count: 12 }, { subject_type: "plan", subject_id: "u3" }),
      t,
    );
    expect(words).toEqual({
      title: "12 bakım size atandı — Kasım 2026",
      body: "Kasım 2026 dönemi için 12 bakım ziyareti size atandı. Listenizi ShiftLush'ta rota sırasıyla görebilirsiniz.",
      known: true,
    });
  });

  it("falls back when the count is not a number", () => {
    expect(describeNotification(notification("visit_assigned", { period: "2026-11", count: "many" }), t).known).toBe(false);
  });

  it("words a fault reported from the sticker, with the lift stopped and the resident's words", () => {
    const words = describeNotification(
      notification(
        "fault_reported",
        {
          reference: "K7M2QX",
          elevator_name: "Sol asansör",
          building_name: "A Blok",
          priority: "high",
          channel: "public_qr",
          description: "Katlar arasında durdu",
        },
        { subject_type: "fault", subject_id: "f1" },
      ),
      t,
    );
    expect(words).toEqual({
      title: "Arıza bildirildi: Sol asansör (A Blok)",
      body:
        "A Blok binasındaki Sol asansör asansörü için QR etiketinden arıza bildirildi; asansör çalışmıyor. " +
        "Bildirim numarası K7M2QX. Açıklama: “Katlar arasında durdu”",
      known: true,
    });
  });

  it("words an emergency, an assignment and a resolution as their e-mails do", () => {
    const base = { reference: "K7M2QX", elevator_name: "Sol asansör", building_name: "A Blok" };
    expect(describeNotification(notification("fault_emergency", { ...base, priority: "emergency" }), t)).toMatchObject({
      title: "ACİL: Sol asansör (A Blok) asansöründe mahsur kalan var",
      body: "A Blok binasındaki Sol asansör asansöründe mahsur kalan olduğu bildirildi. Bildirim numarası K7M2QX.",
    });
    expect(describeNotification(notification("fault_assigned", { ...base, priority: "emergency" }), t).body).toBe(
      "A Blok binasındaki Sol asansör asansörünün K7M2QX numaralı arızası size atandı. Asansörde mahsur kalan var.",
    );
    expect(
      describeNotification(notification("fault_resolved", { ...base, technician_name: "Hakan Çelik" }), t).body,
    ).toContain("Hakan Çelik tarafından çözüldü olarak işaretlendi");
  });

  it("words the inspection kinds as their e-mails do", () => {
    const base = { elevator_name: "Sol asansör", building_name: "A Blok" };
    expect(
      describeNotification(
        notification("inspection_due", { ...base, next_inspection_date: "2027-03-14", inspection_body: "TÜV Austria Türk" }),
        t,
      ).body,
    ).toBe(
      "A Blok binasındaki Sol asansör asansörünün periyodik muayenesi 14.03.2027 tarihinde yapılmalı. " +
        "Son muayeneyi yapan kuruluş: TÜV Austria Türk. Muayene randevusunu şimdiden planlayabilirsiniz.",
    );
    const near = describeNotification(
      notification("correction_deadline_near", {
        ...base,
        label: "yellow",
        correction_deadline: "2026-11-05",
        days_left: 15,
        open_nonconformities: 2,
      }),
      t,
    );
    expect(near.title).toBe("Düzeltme süresi yaklaşıyor: Sol asansör (A Blok), 15 gün kaldı");
    expect(near.body).toContain("sarı etiketle bildirilen kusurlarının 05.11.2026 tarihine kadar");
    expect(
      describeNotification(
        notification("correction_deadline_passed", { ...base, correction_deadline: "2026-10-20", open_nonconformities: 1 }),
        t,
      ).title,
    ).toBe("MÜHÜR RİSKİ: Sol asansör (A Blok) düzeltme süresi doldu");
    expect(
      describeNotification(
        notification("inspection_red_label", { ...base, inspected_on: "2026-10-20", correction_deadline: "2026-12-19" }),
        t,
      ).body,
    ).toContain("20.10.2026 tarihli periyodik muayenede kırmızı etiket aldı");
  });

  it("words the billing kinds as their e-mails do", () => {
    expect(
      describeNotification(notification("invoice_drafts_ready", { period: "2026-10", count: 16, needs_price: 3 }), t),
    ).toMatchObject({
      title: "Ekim 2026 için 16 fatura taslağı hazır",
      body: expect.stringContaining("Ekim 2026 için 16 fatura taslağı hazır, 3 tanesinde fiyat eksik."),
    });
    expect(
      describeNotification(
        notification("billing_vat_missing", {
          contract_number: "2026-0043",
          customer_name: "Dadaş",
          period_start: "2026-10-01",
          period_end: "2026-10-31",
        }),
        t,
      ).body,
    ).toContain("Dadaş ile yapılan 2026-0043 numaralı sözleşmenin 01.10.2026 – 31.10.2026 dönemi için");
  });

  it("words the monthly reports notice as its e-mail does", () => {
    const words = describeNotification(
      notification("monthly_reports_ready", { period: "2026-10", count: 16, sent: 14, no_recipient: 2, not_enabled: 0, failed: 0 }),
      t,
    );
    expect(words).toEqual({
      title: "Ekim 2026 raporları hazır",
      body: "Ekim 2026 raporları hazır: 14 gönderildi, 2 alıcısız.",
      known: true,
    });
    expect(
      describeNotification(
        notification("monthly_reports_ready", { period: "2026-10", count: 5, sent: 0, no_recipient: 0, not_enabled: 4, failed: 1 }),
        t,
      ).body,
    ).toBe("Ekim 2026 raporları hazır: 0 gönderildi, 4 gönderim kapalı, 1 başarısız.");
    expect(describeNotification(notification("monthly_reports_ready", { period: "2026-10" }), t).known).toBe(false);
  });

  it("falls back to a plain notice for a kind this client does not know", () => {
    const words = describeNotification(notification("invoice_overdue", { amount: "100" }), t);
    expect(words).toEqual({
      title: t("notification.unknown.title"),
      body: t("notification.unknown.body"),
      known: false,
    });
  });

  it("falls back rather than print a sentence with a hole in it", () => {
    const words = describeNotification(notification("contract_expired", { end_date: "2026-10-19" }), t);
    expect(words.known).toBe(false);
    expect(words.body).not.toContain("numaralı");
  });
});

describe("notificationTarget", () => {
  it("leads to the contract or the elevator the notice is about", () => {
    expect(notificationTarget({ subject_type: "contract", subject_id: "k1" })).toEqual({
      to: "/contracts/$id",
      params: { id: "k1" },
    });
    expect(notificationTarget({ subject_type: "elevator", subject_id: "e1" })).toEqual({
      to: "/elevators/$id",
      params: { id: "e1" },
    });
  });

  it("leads a billing notice to the billing screen", () => {
    expect(notificationTarget({ subject_type: "billing", subject_id: "co1" })).toEqual({ to: "/billing" });
  });

  it("leads the monthly reports notice to the reports screen for that month", () => {
    expect(
      notificationTarget({ subject_type: "reports", subject_id: "co1", data: { period: "2026-10" } }),
    ).toEqual({ to: "/reports", search: { period: "2026-10" } });
    expect(notificationTarget({ subject_type: "reports", subject_id: "co1", data: { period: "soon" } })).toEqual({
      to: "/reports",
      search: {},
    });
  });

  it("leads a fault notice to the fault", () => {
    expect(notificationTarget({ subject_type: "fault", subject_id: "f1" })).toEqual({
      to: "/faults/$id",
      params: { id: "f1" },
    });
  });

  it("leads a plan notice to the technician's own list for today", () => {
    expect(notificationTarget({ subject_type: "plan", subject_id: "u3" })).toEqual({ to: "/today" });
  });

  it("leads nowhere for a subject this client has no screen for", () => {
    expect(notificationTarget({ subject_type: "invoice", subject_id: "i1" })).toBeNull();
    expect(notificationTarget({ subject_type: "contract", subject_id: "" })).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");

  it("says just now, then minutes, hours and days ago", () => {
    expect(relativeTime("2026-10-20T11:59:40Z", t, now)).toBe(t("notification.justNow"));
    expect(relativeTime("2026-10-20T11:55:00Z", t, now)).toBe("5 dakika önce");
    expect(relativeTime("2026-10-20T09:00:00Z", t, now)).toBe("3 saat önce");
    expect(relativeTime("2026-10-19T12:00:00Z", t, now)).toBe("dün");
    expect(relativeTime("2026-10-16T12:00:00Z", t, now)).toBe("4 gün önce");
  });

  it("gives the date itself after a week, day first", () => {
    expect(relativeTime("2026-10-01T09:00:00Z", t, now)).toBe("01.10.2026");
  });

  it("is empty for something that is not a time", () => {
    expect(relativeTime("not a date", t, now)).toBe("");
  });
});

describe("badgeLabel", () => {
  it("shows nothing at zero, the number up to nine, and 9+ beyond", () => {
    expect(badgeLabel(0)).toBe("");
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(250)).toBe("9+");
  });
});
