"use client";

import { DayPicker, TZDate } from "react-day-picker";
import { useSyncExternalStore } from "react";
import { studioDayKey, studioDayLabel, studioZone } from "@/lib/studio-time";

type Props = {
  value: string;
  onChange: (value: string) => void;
  availableDays?: string[];
  firstDay?: string;
  lastDay?: string;
  disabled?: boolean;
  name?: string;
};

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function calendarDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new TZDate(year, month - 1, day, 12, 0, 0, studioZone);
}

export default function StudioCalendar({ value, onChange, availableDays, firstDay, lastDay, disabled, name }: Props) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  if (!hydrated) return <div className="calendar-placeholder" role="status">Loading calendar…</div>;
  const first = firstDay || availableDays?.[0];
  const last = lastDay || availableDays?.at(-1);
  const chosen = value ? calendarDate(value) : undefined;
  return <div className="studio-calendar">
    {name && <input type="hidden" name={name} value={value} />}
    <DayPicker
      mode="single"
      required
      timeZone={studioZone}
      weekStartsOn={1}
      selected={chosen}
      onSelect={day => { if (day) onChange(studioDayKey(day)); }}
      defaultMonth={chosen || (first ? calendarDate(first) : undefined)}
      startMonth={first ? calendarDate(first) : undefined}
      endMonth={last ? calendarDate(last) : undefined}
      showOutsideDays
      fixedWeeks
      navLayout="after"
      disabled={day => {
        if (disabled) return true;
        const key = studioDayKey(day);
        return Boolean((first && key < first) || (last && key > last) ||
          (availableDays && !availableDays.includes(key)));
      }}
      footer={<span className="calendar-selection">{value ? studioDayLabel(value) : "Select a day"}</span>}
    />
  </div>;
}
