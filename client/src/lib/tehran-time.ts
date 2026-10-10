/**
 * Tehran wall-clock formatting.
 *
 * Every user-visible timestamp (chat hours, report dates, membership
 * dates) renders in Asia/Tehran — never the device timezone — so a phone
 * set to another zone (travel, VPN, wrong default) still shows the same
 * times as everyone else. Server day boundaries already use Tehran.
 */

export const TEHRAN_TZ = "Asia/Tehran"

export function formatTehran(
  input: string | number | Date,
  opts: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      ...opts,
      timeZone: TEHRAN_TZ,
    }).format(new Date(input))
  } catch {
    return ""
  }
}
