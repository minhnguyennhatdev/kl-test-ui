'use client';

import { useEffect, useRef, useState } from 'react';
import {
  call,
  type Appointment,
  type AppointmentList,
  type Availability,
  type Dealership,
  type Problem,
  type Reference,
  type ServiceType,
  type Slot,
  type Vehicle,
} from './lib/api';

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

const PAGE_SIZE = 8;

type Toast = {
  id: number;
  kind: 'ok' | 'no';
  title: string;
  lines: string[];
  alternatives: Slot[];
  correlationId: string;
};

function Spinner() {
  return (
    <svg className="size-4 shrink-0 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" className="opacity-30" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Pager({
  page,
  total,
  busy,
  onPage,
}: {
  page: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
      <span className="tabular-nums">
        {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button className={GHOST} disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <button className={GHOST} disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dealership, setDealership] = useState('');
  const [service, setService] = useState('');
  const [vin, setVin] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [zone, setZone] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [diary, setDiary] = useState<Appointment[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [slotPage, setSlotPage] = useState(1);
  const [slotTotal, setSlotTotal] = useState(0);
  const [diaryPage, setDiaryPage] = useState(1);
  const [diaryTotal, setDiaryTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const nextToastId = useRef(0);

  // Any change to what is being listed invalidates the page number: landing on
  // page 3 of a day that has one page reads as a bug.
  function onFilterChange(apply: () => void) {
    apply();
    setSlotPage(1);
    setDiaryPage(1);
  }

  function dismiss(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function notify(toast: Omit<Toast, 'id'>) {
    const id = (nextToastId.current += 1);
    setToasts((current) => [...current, { ...toast, id }]);
    // A refusal carries alternatives and a correlation id someone may still
    // need; a confirmation has said its piece by the time it is read.
    if (toast.kind === 'ok') setTimeout(() => dismiss(id), 6000);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('dealership');

    setDate(params.get('date') || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
    setService(params.get('service') ?? '');
    setVin(params.get('vin') ?? '');
    setSearch(params.get('q') ?? '');
    setSlotPage(Number(params.get('page')) || 1);
    setDiaryPage(Number(params.get('diaryPage')) || 1);

    void (async () => {
      const reply = await call<Reference>('/reference', '');
      if (reply.status !== 200 || reply.body.dealerships.length === 0) return;
      setDealerships(reply.body.dealerships);
      setDealership(
        reply.body.dealerships.find((option) => option.id === wanted)?.id ??
          reply.body.dealerships[0].id,
      );
    })();
  }, []);

  // Every filter lives in the URL, so a slot can be sent to a colleague as a
  // link instead of described over the phone. replaceState rather than push:
  // typing in the search box should not fill the back button.
  useEffect(() => {
    if (!dealership) return;

    const params = new URLSearchParams({ dealership, date, service, vin });
    if (search.trim()) params.set('q', search.trim());
    if (slotPage > 1) params.set('page', String(slotPage));
    if (diaryPage > 1) params.set('diaryPage', String(diaryPage));

    window.history.replaceState(null, '', `?${params}`);
  }, [dealership, date, service, vin, search, slotPage, diaryPage]);

  useEffect(() => {
    if (!dealership) return;

    const term = search.trim();
    // Debounced only when there is a term: switching dealership should not wait.
    const timer = setTimeout(
      () => {
        void (async () => {
          const query = term ? `?${new URLSearchParams({ search: term })}` : '';
          const reply = await call<Reference>(`/reference${query}`, dealership);
          if (reply.status !== 200) return;

          setZone(reply.body.dealership?.timezone ?? '');
          setServiceTypes(reply.body.serviceTypes);
          setVehicles(reply.body.vehicles);

          setService((current) =>
            reply.body.serviceTypes.some((type) => type.code === current)
              ? current
              : (reply.body.serviceTypes[0]?.code ?? ''),
          );
          setVin((current) =>
            reply.body.vehicles.some((vehicle) => vehicle.vin === current)
              ? current
              : (reply.body.vehicles[0]?.vin ?? ''),
          );
        })();
      },
      term ? 250 : 0,
    );

    return () => clearTimeout(timer);
  }, [dealership, search]);

  useEffect(() => {
    if (date && service && dealership) void refresh();
  }, [date, service, dealership, slotPage, diaryPage]);

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
    setFinding(true);
    try {
      await findSlots();
      await loadDiary();
    } finally {
      setFinding(false);
    }
  }

  async function findSlots() {
    const query = new URLSearchParams({
      serviceTypeCode: service,
      from: `${date}T00:00:00Z`,
      to: `${date}T23:59:00Z`,
      limit: String(PAGE_SIZE),
      offset: String((slotPage - 1) * PAGE_SIZE),
    });

    const reply = await call<Availability>(
      `/dealerships/${dealership}/availability?${query}`,
      dealership,
    );
    if (reply.status !== 200) {
      const problem = reply.body as unknown as Problem;
      setSlots([]);
      setSlotTotal(0);
      notify({
        kind: 'no',
        title: `${reply.status} · ${problem.title ?? 'Failed'}`,
        lines: [problem.detail ?? ''],
        alternatives: [],
        correlationId: reply.correlationId,
      });
      return;
    }

    setZone(reply.body.timezone);
    setSlots(reply.body.slots);
    setSlotTotal(reply.body.page.total);
  }

  async function loadDiary() {
    const query = new URLSearchParams({
      from: `${date}T00:00:00Z`,
      to: `${date}T23:59:59Z`,
    });

    query.set('limit', String(PAGE_SIZE));
    query.set('offset', String((diaryPage - 1) * PAGE_SIZE));

    const reply = await call<AppointmentList>(`/appointments?${query}`, dealership);
    if (reply.status === 200) {
      setDiary(reply.body.appointments);
      setDiaryTotal(reply.body.page.total);
    }
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
      if (reply.status === 200 || reply.status === 201) {
        const a = reply.body;
        notify({
          kind: 'ok',
          title: reply.status === 201 ? 'Booked' : 'Replayed — nothing new was created',
          lines: [
            `${a.serviceType.name} for ${a.vehicle.make} ${a.vehicle.model}`,
            `${time(a.serviceStartsAt)}–${time(a.serviceEndsAt)} with ${a.technician.fullName} in ${a.serviceBay.name}`,
            `Resources held until ${time(a.resourcesHeldUntil)}`,
          ],
          alternatives: [],
          correlationId: reply.correlationId,
        });
      } else {
        const problem = reply.body as unknown as Problem;
        notify({
          kind: 'no',
          title: `${reply.status} · ${problem.type}`,
          lines: [
            problem.detail ?? '',
            reply.status === 409 ? '409 is "not then" — another time may work.' : '',
            reply.status === 422 ? '422 is permanent — asking again will not help.' : '',
          ].filter(Boolean),
          alternatives: problem.alternatives ?? [],
          correlationId: reply.correlationId,
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
            <select
              id="dealership"
              className={INPUT}
              value={dealership}
              onChange={(event) => onFilterChange(() => setDealership(event.target.value))}
            >
              {dealerships.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="service" className="text-xs text-stone-500">
              Service
            </label>
            <select
              id="service"
              className={INPUT}
              value={service}
              onChange={(event) => onFilterChange(() => setService(event.target.value))}
            >
              {serviceTypes.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name} ({option.durationMinutes}m)
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
              onChange={(event) => onFilterChange(() => setDate(event.target.value))}
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
              disabled={vehicles.length === 0}
              onChange={(event) => setVin(event.target.value)}
            >
              {vehicles.map((option) => (
                <option key={option.vin} value={option.vin}>
                  {option.vin} — {option.make} {option.model} · {option.customerName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="search" className="text-xs text-stone-500">
              Find a vehicle
            </label>
            <input
              id="search"
              className={INPUT}
              placeholder="VIN, make, model or owner"
              value={search}
              onChange={(event) => onFilterChange(() => setSearch(event.target.value))}
            />
          </div>
          <button
            className={`${PRIMARY} inline-flex items-center gap-2`}
            onClick={() => void refresh()}
            disabled={busy || finding || !date || !service}
          >
            {finding && <Spinner />}
            {finding ? 'Finding slots…' : 'Find slots'}
          </button>
        </div>

        {slots.length > 0 ? (
          <div className={finding ? 'opacity-40 transition-opacity' : 'transition-opacity'}>
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
            <Pager page={slotPage} total={slotTotal} busy={busy || finding} onPage={setSlotPage} />
            <p className="mt-3 text-xs text-stone-500">
              Times are {zone}, the dealership&apos;s own clock. Capacity is how many
              of this slot could be booked at once — it was true a moment ago.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-stone-500">
            {finding
              ? 'Asking the scheduler…'
              : 'Nothing free that day — try another, or a different service.'}
          </p>
        )}

      </section>

      <h2 className="mt-8 mb-2.5 text-xs font-medium uppercase tracking-widest text-stone-500">
        The day so far
      </h2>
      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
        <button
          className={`${GHOST} inline-flex items-center gap-2`}
          onClick={() => void refresh()}
          disabled={busy || finding || !date || !service}
        >
          {finding && <Spinner />}
          {finding ? 'Refreshing…' : 'Refresh'}
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
        {diaryTotal > 0 && (
          <Pager page={diaryPage} total={diaryTotal} busy={busy || finding} onPage={setDiaryPage} />
        )}
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto w-full max-w-sm rounded-xl border p-3.5 text-sm shadow-lg ${
              toast.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{toast.title}</h3>
              <button
                className="shrink-0 text-lg leading-none opacity-50 hover:opacity-100"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
              >
                ×
              </button>
            </div>
            {toast.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            {toast.alternatives.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {toast.alternatives.map((slot) => (
                  <button
                    key={slot.startsAt}
                    className={GHOST}
                    disabled={busy}
                    onClick={() => {
                      dismiss(toast.id);
                      void book(slot.startsAt);
                    }}
                  >
                    {time(slot.startsAt)}
                  </button>
                ))}
              </div>
            )}
            {toast.correlationId && (
              <div className="mt-2.5 text-xs opacity-70">
                x-correlation-id: <code className="font-mono">{toast.correlationId}</code>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
