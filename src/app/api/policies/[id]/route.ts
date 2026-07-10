import { NextResponse } from 'next/server';
import { getPolicyById } from '@/lib/data-service';

// GET - Retrieve a single policy by ID (read-only public API)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const policy = await getPolicyById(id);

    if (!policy) {
      return NextResponse.json(
        { error: 'Policy not found', success: false },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: policy,
      success: true,
    });
  } catch (error) {
    console.error('Error reading policy:', error);
    return NextResponse.json(
      { error: 'Failed to read policy', success: false },
      { status: 500 }
    );
  }
}
