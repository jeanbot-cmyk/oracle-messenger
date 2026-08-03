import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.backendToken) {
      return NextResponse.json({ tracked: false, reason: 'Non authentifié' }, { status: 401 });
    }

    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      return NextResponse.json({ tracked: false, reason: 'Backend indisponible' }, { status: 500 });
    }

    const res = await fetch(`${backendUrl}/admin/pwa-install`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.user.backendToken}` },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ tracked: false, error: e?.message ?? 'Erreur suivi installation' }, { status: 500 });
  }
}
