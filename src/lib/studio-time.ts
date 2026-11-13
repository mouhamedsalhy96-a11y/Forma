export const studioZone = "Europe/London";

export function studioDayKey(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: studioZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const part = (name: string) => parts.find(item => item.type === name)?.value;
  return [part("year"), part("month"), part("day")].join("-");
}

export function studioDayLabel(key: string) {
  return new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", {
    timeZone: studioZone, weekday: "long", day: "numeric", month: "long",
  });
}
