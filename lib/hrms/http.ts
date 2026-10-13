import { readDashboard, teamPage, profileQueue } from "./employee-portal.ts";
import { protectedHeaders } from "./security.ts";
import {
  employeePage,
  candidatePage,
  jobPage,
  employeeTimeline,
  employeeExport,
  candidateTimeline,
} from "./records.ts";
import { AppError, assertOrigin, readJsonBody } from "./domain.ts";
import { bootstrap, readWorkspace, readPlatform, mutate } from "./service.ts";
import type { Context } from "./service.ts";
import { ZodError } from "zod";
const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: protectedHeaders(),
  });
function failure(e: unknown) {
  if (e instanceof AppError) return response({ error: e.message }, e.status);
  if (e instanceof ZodError)
    return response(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      422,
    );
  if (e instanceof Error && /UNIQUE constraint/.test(e.message))
    return response(
      { error: "A record with these details already exists." },
      409,
    );
  console.error(
    "HRMS request failed",
    e instanceof Error ? e.name : "UnknownError",
  );
  return response(
    { error: "The operation could not be completed. Please retry." },
    500,
  );
}
async function GET(request: Request, context: () => Promise<Context>) {
  try {
    const c = await context(),
      url = new URL(request.url),
      view = url.searchParams.get("view"),
      tenant = url.searchParams.get("tenant") ?? "";
    if (view === "employee_picker") {
      const page = await employeePage(
        c,
        tenant,
        Object.fromEntries(url.searchParams),
        "employee.edit",
      );
      return response({
        ...page,
        rows: page.rows.map((r) => {
          const e = r as Record<string, unknown>;
          return {
            id: e.id,
            full_name: e.full_name,
            employee_code: e.employee_code,
          };
        }),
      });
    }
    if (view === "dashboard")
      return response(
        await readDashboard(
          c,
          tenant,
          url.searchParams.get("mode") ?? "",
          Object.fromEntries(url.searchParams),
        ),
      );
    if (view === "team")
      return response(
        await teamPage(c, tenant, Object.fromEntries(url.searchParams)),
      );
    if (view === "profile_queue")
      return response(await profileQueue(c, tenant));
    if (view === "workspace") return response(await readWorkspace(c, tenant));
    if (view === "platform") return response(await readPlatform(c));
    if (view === "employees")
      return response(
        await employeePage(
          c,
          tenant,
          Object.fromEntries(
            [...url.searchParams.entries()].filter(
              ([k]) => !["tenant", "view"].includes(k),
            ),
          ),
        ),
      );
    if (view === "candidates")
      return response(
        await candidatePage(
          c,
          tenant,
          Object.fromEntries(
            [...url.searchParams.entries()].filter(
              ([k]) => !["tenant", "view"].includes(k),
            ),
          ),
        ),
      );
    if (view === "jobs")
      return response(
        await jobPage(
          c,
          tenant,
          Object.fromEntries(
            [...url.searchParams.entries()].filter(
              ([k]) => !["tenant", "view"].includes(k),
            ),
          ),
        ),
      );
    if (view === "employee_history")
      return response(
        await employeeTimeline(c, tenant, url.searchParams.get("id") ?? ""),
      );
    if (view === "history")
      return response(
        await candidateTimeline(c, tenant, url.searchParams.get("id") ?? ""),
      );
    if (view === "export") return response(await employeeExport(c, tenant));
    return response(await bootstrap(c));
  } catch (e) {
    return failure(e);
  }
}
async function POST(request: Request, context: () => Promise<Context>) {
  try {
    assertOrigin(request);
    if (Number(request.headers.get("content-length") ?? 0) > 65536)
      throw new AppError(413, "Request is too large.");
    const c = await context();
    const body = await readJsonBody(request, 65536);
    if (
      !body ||
      typeof body.action !== "string" ||
      typeof body.data !== "object" ||
      body.data === null ||
      Array.isArray(body.data)
    )
      throw new AppError(422, "Invalid request.");
    const window = Math.floor(Date.now() / 60000);
    const key = c.identity.userId;
    const limit = await c.db
      .prepare(
        "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window RETURNING count",
      )
      .bind(key, window)
      .first<{ count: number }>();
    if ((limit?.count ?? 0) > 60)
      throw new AppError(429, "Too many actions. Try again in a minute.");
    return response(
      await mutate(c, body.action, String(body.tenant ?? ""), body.data),
    );
  } catch (e) {
    return failure(e);
  }
}

export async function handleRequest(
  request: Request,
  context: () => Promise<Context>,
) {
  if (request.method === "GET") return GET(request, context);
  if (request.method === "POST") return POST(request, context);
  return response({ error: "Method not allowed." }, 405);
}
