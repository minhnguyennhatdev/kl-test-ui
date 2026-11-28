export type Slot = {
  startsAt: string;
  endsAt: string;
  technicians: number;
  serviceBays: number;
  capacity: number;
};

/** What the server counted before it cut the page. */
export type Page = { limit: number; offset: number; total: number };

export type Availability = { timezone: string; slots: Slot[]; page: Page };

export type AppointmentList = { appointments: Appointment[]; page: Page };

export type Dealership = { id: string; name: string; timezone: string };

export type ServiceType = {
  code: string;
  name: string;
  durationMinutes: number;
  requiredSkills: string[];
  requiredCapabilities: string[];
};

export type Reference = {
  dealerships: Dealership[];
  dealership: Dealership | null;
  serviceTypes: ServiceType[];
  vehicles: Vehicle[];
};

export type Vehicle = {
  vin: string;
  make: string;
  model: string;
  modelYear: number | null;
  customerName: string;
};

export type Appointment = {
  id: string;
  status: string;
  serviceStartsAt: string;
  serviceEndsAt: string;
  resourcesHeldUntil: string;
  serviceType: { code: string; name: string };
  vehicle: { vin: string; make: string; model: string };
  technician: { fullName: string };
  serviceBay: { name: string };
};

export type Problem = {
  type: string;
  title: string;
  detail?: string;
  alternatives?: Slot[];
};

export type Reply<T> = { status: number; body: T; correlationId: string };

export async function call<T>(
  path: string,
  dealershipId: string,
  init: RequestInit = {},
): Promise<Reply<T>> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      // Discovering a dealership has to work before there is one to scope to.
      ...(dealershipId ? { 'x-dealership-id': dealershipId } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();

  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as T,
    correlationId: response.headers.get('x-correlation-id') ?? '',
  };
}
