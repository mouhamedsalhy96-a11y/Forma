"use client";

import { useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  blockedTimes?: string[];
  disabled?: boolean;
  name?: string;
};
const periods = [
  { id: "morning", label: "Morning", from: 6, to: 12 },
  { id: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { id: "evening", label: "Evening", from: 17, to: 21 },
];
export default function StudioTimePicker({ value, onChange, blockedTimes = [], disabled, name = "time" }: Props) {
  const [periodId, setPeriodId] = useState("morning");
  const period = periods.find(item => item.id === periodId)!;
  const times = Array.from({ length: (period.to - period.from) * 4 }, (_, index) => {
    const hour = period.from + Math.floor(index / 4);
    const minute = (index % 4) * 15;
    return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }).filter(time => time <= "20:00");
  return <div className="studio-time-picker">
    <input type="hidden" name={name} value={value} />
    <div className="time-periods" role="group" aria-label="Time of day">
      {periods.map(item => <button type="button" key={item.id} disabled={disabled} aria-pressed={item.id === periodId} onClick={() => setPeriodId(item.id)}>{item.label}</button>)}
    </div>
    <div className="time-choice-grid" role="group" aria-label="Studio start time">
      {times.map(time => <button type="button" key={time} disabled={disabled || blockedTimes.includes(time)} aria-pressed={value === time} onClick={() => onChange(time)}>{time}</button>)}
    </div>
    <p className="time-selection" aria-live="polite">{value ? "Selected start · " + value : "Select a start time"}<span>Europe/London</span></p>
  </div>;
}
