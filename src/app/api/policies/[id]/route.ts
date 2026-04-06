import { NextResponse } from 'next/server';
import { getPolicyById, updatePolicy, deletePolicy } from '@/lib/data-service';

// GET - Retrieve a single policy by ID
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

// PATCH - Update a policy
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updated = await updatePolicy(id, body);

    if (!updated) {
      return NextResponse.json(
        { error: 'Policy not found', success: false },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: updated,
      success: true,
    });
  } catch (error) {
    console.error('Error updating policy:', error);
    return NextResponse.json(
      { error: 'Failed to update policy', success: false },
      { status: 500 }
    );
  }
}

// DELETE - Permanently delete a policy
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deletePolicy(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Policy not found', success: false },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting policy:', error);
    return NextResponse.json(
      { error: 'Failed to delete policy', success: false },
      { status: 500 }
    );
  }
}
