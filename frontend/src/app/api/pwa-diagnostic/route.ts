import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function clean(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.replace(/[\r\n\t]/g, ' ').slice(0, 700);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const payload = {
      event: clean(body.event),
      time: clean(body.time),
      path: clean(body.path),
      standalone: Boolean(body.standalone),
      online: Boolean(body.online),
      detail: body.detail && typeof body.detail === 'object' ? body.detail : {},
      ua: clean(body.ua || req.headers.get('user-agent') || ''),
      ip: clean(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''),
    };

    console.info('[Oracle PWA diagnostic]', JSON.stringify(payload));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.warn('[Oracle PWA diagnostic error]', err?.message || String(err));
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
