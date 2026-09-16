import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { loginStart, loginVerify } from "./src/auth.ts";

const CODE_FILE = "/tmp/feedonomics-2fa-code.txt";
const RESULT_FILE = "/tmp/feedonomics-login-result.json";

function write(result: unknown) {
  writeFileSync(RESULT_FILE, JSON.stringify(result));
}

(async () => {
  if (existsSync(CODE_FILE)) unlinkSync(CODE_FILE);
  const start = await loginStart();
  if (start.status === "ok") {
    write({ status: "ok", note: "device was already remembered, no 2FA needed" });
    return;
  }
  write({ status: "waiting_for_code" });

  for (let i = 0; i < 150; i++) {
    if (existsSync(CODE_FILE)) {
      const code = readFileSync(CODE_FILE, "utf8").trim();
      unlinkSync(CODE_FILE);
      const verify = await loginVerify(code);
      write(verify);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  write({ status: "timeout" });
})().catch((e) => write({ status: "error", message: e.message }));
