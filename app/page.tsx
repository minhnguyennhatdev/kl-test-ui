'use client';

import { useEffect, useState } from 'react';
import {
  call,
  type Appointment,
  type Availability,
  type Problem,
  type Slot,
} from './lib/api';

const DEALERSHIP = '11111111-1111-1111-1111-111111111111';

const SERVICES = [
  { code: 'INTERIM_SERVICE', label: 'Interim service (60m)' },
  { code: 'FULL_SERVICE', label: 'Full service (120m)' },
  { code: 'MOT', label: 'MOT test (45m)' },
  { code: 'DIAGNOSTIC', label: 'Diagnostic (90m)' },
  { code: 'WHEEL_ALIGNMENT', label: 'Wheel alignment (60m)' },
  { code: 'EV_BATTERY_HEALTH', label: 'EV battery health (120m)' },
];

const VEHICLES = [
  { vin: 'WVWZZZ1KZAW000001', label: 'VW Golf' },
  { vin: 'WF0XXXTTGXKA00002', label: 'Ford Transit' },
  { vin: 'KMHC851HFNU000003', label: 'Hyundai Ioniq' },
  { vin: 'W0LXXXBEN00000004', label: 'Vauxhall Corsa' },
];

const INPUT =
  'rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const PRIMARY =
  'rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-blue-800 disabled:opacity-40';
const GHOST =
  'rounded-lg border border-blue-700 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:opacity-40';
const TH =
  'border-b border-stone-200 px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-500';
const TD = 'border-b border-stone-100 px-2 py-2 tabular-nums';
const PILL = 'inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600';

type Result = {
  kind: 'ok' | 'no';
  title: string;
  lines: string[];
  alternatives: Slot[];
};

export default function Page() {
  const [dealership, setDealership] = useState(DEALERSHIP);
  const [service, setService] = useState(SERVICES[0].code);
  const [vin, setVin] = useState(VEHICLES[0].vin);
  const [date, setDate] = useState('');
  const [zone, setZone] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [diary, setDiary] = useState<Appointment[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [correlation, setCorrelation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDate(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    if (date) void refresh();
  }, [date, service, dealership]);

  // A workshop runs on its own wall clock. Showing a Reading dealership's 08:00
  // as 15:00 because the browser sits in Bangkok is the mistake the server side
  // goes to some trouble to avoid.
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone || undefined,
    });

  async function refresh() {
    await findSlots();
    await loadDiary();
  }

  async function findSlots() {
    const query = new URLSearchParams({
      serviceTypeCode: service,
      from: `${date}T00:00:00Z`,
      to: `${date}T23:59:00Z`,
    });

    const reply = await call<Availability>(
      `/dealerships/${dealership}/availability?${query}`,
      dealership,
    );
    setCorrelation(reply.correlationId);

    if (reply.status !== 200) {
      const problem = reply.body as unknown as Problem;
      setSlots([]);
      setResult({
        kind: 'no',
        title: `${reply.status} · ${problem.title ?? 'Failed'}`,
        lines: [problem.detail ?? ''],
        alternatives: [],
      });
      return;
    }

    setZone(reply.body.timezone);
    setSlots(reply.body.slots);
  }

  async function loadDiary() {
    const query = new URLSearchParams({
      from: `${date}T00:00:00Z`,
      to: `${date}T23:59:59Z`,
    });

    const reply = await call<{ appointments: Appointment[] }>(
      `/appointments?${query}`,
      dealership,
    );
    if (reply.status === 200) setDiary(reply.body.appointments);
  }

  async function book(desiredStart: string) {
    setBusy(true);
    try {
      const reply = await call<Appointment>('/appointments', dealership, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          dealershipId: dealership,
          vin,
          serviceTypeCode: service,
          desiredStart,
        }),
      });
      setCorrelation(reply.correlationId);

      if (reply.status === 200 || reply.status === 201) {
        const a = reply.body;
        setResult({
          kind: 'ok',
          title: reply.status === 201 ? 'Booked' : 'Replayed — nothing new was created',
          lines: [
            `${a.serviceType.name} for ${a.vehicle.make} ${a.vehicle.model}`,
            `${time(a.serviceStartsAt)}–${time(a.serviceEndsAt)} with ${a.technician.fullName} in ${a.serviceBay.name}`,
            `Resources held until ${time(a.resourcesHeldUntil)}`,
          ],
          alternatives: [],
        });
      } else {
        const problem = reply.body as unknown as Problem;
        setResult({
          kind: 'no',
          title: `${reply.status} · ${problem.type}`,
          lines: [
            problem.detail ?? '',
            reply.status === 409 ? '409 is "not then" — another time may work.' : '',
            reply.status === 422 ? '422 is permanent — asking again will not help.' : '',
          ].filter(Boolean),
          alternatives: problem.alternatives ?? [],
        });
      }

      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    try {
      await call(`/appointments/${id}/cancellation`, dealership, {
        method: 'POST',
        body: JSON.stringify({ reason: 'cancelled from the UI' }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Service Scheduler</h1>
      <p className="mt-1.5 max-w-2xl text-stone-500">
        Availability is advisory. Booking is the only authority — it is the write
        that decides, and it can still say no.
      </p>

      <h2 className="mt-8 mb-2.5 text-xs font-medium uppercase tracking-widest text-stone-500">
        Find a slot
      </h2>
      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="dealership" className="text-xs text-stone-500">
              Dealership
            </label>
            <input
              id="dealership"
              size={36}
              className={INPUT}
              value={dealership}
              onChange={(event) => setDealership(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="service" className="text-xs text-stone-500">
              Service
            </label>
            <select
              id="service"
              className={INPUT}
              value={service}
              onChange={(event) => setService(event.target.value)}
            >
              {SERVICES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date" className="text-xs text-stone-500">
              Date
            </label>
            <input
              id="date"
              type="date"
              className={INPUT}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="vin" className="text-xs text-stone-500">
              Vehicle
            </label>
            <select
              id="vin"
              className={INPUT}
              value={vin}
              onChange={(event) => setVin(event.target.value)}
            >
              {VEHICLES.map((option) => (
                <option key={option.vin} value={option.vin}>
                  {option.vin} — {option.label}
                </option>
              ))}
            </select>
          </div>
          <button className={PRIMARY} onClick={() => void refresh()} disabled={busy || !date}>
            Find slots
          </button>
        </div>

        {slots.length > 0 ? (
          <>
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>Start</th>
                  <th className={TH}>End</th>
                  <th className={TH}>Technicians</th>
                  <th className={TH}>Bays</th>
                  <th className={TH}>Capacity</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.startsAt} className="hover:bg-stone-50">
                    <td className={TD}>{time(slot.startsAt)}</td>
                    <td className={TD}>{time(slot.endsAt)}</td>
                    <td className={TD}>{slot.technicians}</td>
                    <td className={TD}>{slot.serviceBays}</td>
                    <td className={TD}>
                      <span className={PILL}>{slot.capacity}</span>
                    </td>
                    <td className={`${TD} text-right`}>
                      <button
                        className={GHOST}
                        disabled={busy}
                        onClick={() => void book(slot.startsAt)}
                      >
                        Book
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-stone-500">
              Times are {zone}, the dealership&apos;s own clock. Capacity is how many
              of this slot could be booked at once — it was true a moment ago.
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs text-stone-500">
            Nothing free that day — try another, or a different service.
          </p>
        )}

        {result && (
          <div
            className={
              result.kind === 'ok'
                ? 'mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900'
                : 'mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-900'
            }
          >
            <h3 className="mb-1.5 font-semibold">{result.title}</h3>
            {result.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            {result.alternatives.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {result.alternatives.map((slot) => (
                  <button
                    key={slot.startsAt}
                    className={GHOST}
                    disabled={busy}
                    onClick={() => void book(slot.startsAt)}
                  >
                    {time(slot.startsAt)}
                  </button>
                ))}
              </div>
            )}
            {correlation && (
              <div className="mt-2.5 text-xs opacity-70">
                x-correlation-id: <code className="font-mono">{correlation}</code>
              </div>
            )}
          </div>
        )}
      </section>

      <h2 className="mt-8 mb-2.5 text-xs font-medium uppercase tracking-widest text-stone-500">
        The day so far
      </h2>
      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <button className={GHOST} onClick={() => void refresh()} disabled={busy || !date}>
          Refresh
        </button>
        {diary.length > 0 ? (
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>Time</th>
                <th className={TH}>Vehicle</th>
                <th className={TH}>Service</th>
                <th className={TH}>Technician</th>
                <th className={TH}>Bay</th>
                <th className={TH}>Status</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {diary.map((appointment) => (
                <tr
                  key={appointment.id}
                  className={
                    appointment.status === 'CANCELLED'
                      ? 'text-stone-400 line-through'
                      : 'hover:bg-stone-50'
                  }
                >
                  <td className={TD}>{time(appointment.serviceStartsAt)}</td>
                  <td className={TD}>{appointment.vehicle.vin}</td>
                  <td className={TD}>{appointment.serviceType.name}</td>
                  <td className={TD}>{appointment.technician.fullName}</td>
                  <td className={TD}>{appointment.serviceBay.name}</td>
                  <td className={TD}>
                    <span className={PILL}>{appointment.status}</span>
                  </td>
                  <td className={`${TD} text-right`}>
                    {appointment.status !== 'CANCELLED' && (
                      <button
                        className={GHOST}
                        disabled={busy}
                        onClick={() => void cancel(appointment.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-xs text-stone-500">Nothing booked that day yet.</p>
        )}
      </section>
    </main>
  );
}
