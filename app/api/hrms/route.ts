import { serverContext } from "@/lib/hrms/server-auth";
import { handleRequest } from "@/lib/hrms/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handleRequest(request, serverContext);
}
export async function POST(request: Request) {
  return handleRequest(request, serverContext);
}
