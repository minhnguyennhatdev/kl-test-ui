export type Slot = {
  startsAt: string;
  endsAt: string;
  technicians: number;
  serviceBays: number;
  capacity: number;
};

export type Availability = { timezone: string; slots: Slot[] };

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
      'x-dealership-id': dealershipId,
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
