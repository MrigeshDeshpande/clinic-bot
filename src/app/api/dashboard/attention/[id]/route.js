import { NextResponse } from 'next/server';
import { setAttentionStatus } from '@/services/attentionEngine';

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const { status } = body;
    if (!status || !['acknowledged', 'resolved', 'new'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "acknowledged", "resolved", or "new"' },
        { status: 400 }
      );
    }
    // Timeline Event Candidate: Attention Acknowledged / Resolved / Re-opened
    const plan = await setAttentionStatus(params.id, status);
    return NextResponse.json({ plan });
  } catch (e) {
    const httpStatus = e.status || 500;
    return NextResponse.json({ error: e.message }, { status: httpStatus });
  }
}
