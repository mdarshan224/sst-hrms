import { database } from "./d1-adapter.mjs";
import { mutate } from "../lib/hrms/service.ts";
import {
  verificationAction,
  CONSENT_VERSION,
} from "../lib/hrms/verification.ts";
const at = () => new Date().toISOString();
export async function setup(fetcher) {
  const { db, sql } = database(),
    uid = crypto.randomUUID(),
    sid = crypto.randomUUID();
  sql
    .prepare(
      "INSERT INTO users(id,mobile,display_name,verified_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(uid, "9000000001", "John Doe", at(), at());
  sql
    .prepare(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(
      sid,
      uid,
      "synthetic",
      new Date(Date.now() + 3600000).toISOString(),
      at(),
    );
  const c = {
    db,
    identity: {
      userId: uid,
      mobile: "9000000001",
      email: "synthetic@example.test",
      displayName: "John Doe",
    },
    adminMobile: "9000000001",
    sessionId: sid,
  };
  const tid = (
    await mutate(c, "tenant.create", "", {
      name: "Synthetic Alpha",
      adminMobile: c.identity.mobile,
    })
  ).id;
  const other = (
    await mutate(c, "tenant.create", "", {
      name: "Synthetic Beta",
      adminMobile: c.identity.mobile,
    })
  ).id;
  const eid = (
    await mutate(c, "employee.create", tid, {
      fullName: "John Doe",
      email: "john@example.test",
      designation: "Engineer",
      joiningDate: "2026-10-12",
    })
  ).id;
  sql
    .prepare(
      "INSERT INTO employee_accounts(employee_id,tenant_id,user_id,actor_id,created_at) VALUES(?,?,?,?,?)",
    )
    .run(eid, tid, uid, uid, at());
  let calls = 0;
  const config = {
    sandbox: { clientId: "synthetic", clientSecret: "synthetic-secret" },
    production: {},
    fetcher:
      fetcher ??
      (async (url, o) => {
        calls++;
        return Response.json({
          ...JSON.parse(o.body),
          reference_id: 123456,
          status: "VALID",
          pan_status: "E",
          name_match: "Y",
          dob_match: "Y",
        });
      }),
  };
  sql
    .prepare("UPDATE plans SET modules=?")
    .run(
      JSON.stringify([
        "core",
        "recruitment",
        "employee_verification",
        "private_documents",
      ]),
    );
  await verificationAction(c, config, "platform.save", "", {
    enabled: true,
    mode: "sandbox",
    panEnabled: true,
    version: 0,
  });
  await verificationAction(c, config, "policy.save", tid, {
    enabled: true,
    panRequired: true,
    hrReviewRequired: true,
    retentionDays: 90,
    version: 0,
  });
  const input = {
    pan: "ABCPV1234D",
    dob: "1993-06-30",
    requestId: crypto.randomUUID(),
    consent: true,
    consentVersion: CONSENT_VERSION,
  };
  return { c, sql, db, tid, other, eid, config, input, calls: () => calls };
}
