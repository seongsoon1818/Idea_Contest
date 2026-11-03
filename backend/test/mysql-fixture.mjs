import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import mariadb from "mariadb";

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) =>
    socket.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  const { port } = socket.address();
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
function launch(bin, args) {
  const child = spawn(bin, args, { windowsHide: true, stdio: "ignore" });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { child, done };
}

// No user-supplied DATABASE_URL is ever targeted. Start a fresh loopback-only instance,
// pass a random credential via an init file (not argv) and dispose only our temp tree.
export async function withMysql(testBody) {
  const base = await realpath(os.tmpdir()),
    dir = await mkdtemp(path.join(base, "hsupick-db-test-"));
  const bin = process.env.MYSQLD_BIN || "mysqld",
    password = randomBytes(32).toString("hex");
  const options = [
    "--no-defaults",
    "--datadir=" + path.join(dir, "data"),
    "--log-error=" + path.join(dir, "mysql.log"),
  ];
  let server, connection;
  try {
    if ((await launch(bin, [...options, "--initialize-insecure"]).done) !== 0)
      throw new Error("MySQL initialization failed");
    const init = path.join(dir, "init.sql"),
      port = await freePort();
    await writeFile(
      init,
      "ALTER USER 'root'@'localhost' IDENTIFIED BY '" + password + "';\n",
      { mode: 0o600 },
    );
    server = launch(bin, [
      ...options,
      "--bind-address=127.0.0.1",
      "--port=" + port,
      "--mysqlx=OFF",
      "--skip-log-bin",
      "--default-time-zone=+00:00",
      "--init-file=" + init,
      "--socket=" + path.join(dir, "mysql.sock"),
    ]);
    for (let i = 0; i < 150 && !connection; i++) {
      if (server.child.exitCode !== null)
        throw new Error("Temporary MySQL failed to start");
      try {
        connection = await mariadb.createConnection({
          host: "127.0.0.1",
          port,
          user: "root",
          password,
          multipleStatements: true,
          allowPublicKeyRetrieval: true,
          connectTimeout: 1000,
        });
      } catch {
        await delay(200);
      }
    }
    if (!connection) throw new Error("Temporary MySQL connection timed out");
    await connection.query("CREATE DATABASE hsupick_test");
    const url =
      "mysql://root:" +
      password +
      "@127.0.0.1:" +
      port +
      "/hsupick_test?allowPublicKeyRetrieval=true";
    // Exercise the same migration command used on a fresh development database.
    const repo = fileURLToPath(new URL("../", import.meta.url));
    await promisify(execFile)(
      process.execPath,
      [
        path.join(repo, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: repo,
        windowsHide: true,
        env: { ...process.env, DATABASE_URL: url },
        timeout: 60000,
      },
    );
    const [checks] = await connection.query(
      "SELECT COUNT(*) AS n FROM information_schema.table_constraints WHERE constraint_schema='hsupick_test' AND constraint_type='CHECK'",
    );
    const [fks] = await connection.query(
      "SELECT COUNT(*) AS n FROM information_schema.referential_constraints WHERE constraint_schema='hsupick_test'",
    );
    if (Number(checks.n) !== 70 || Number(fks.n) !== 49)
      throw new Error("v2.2 constraint count mismatch");
    await testBody(url);
  } catch (e) {
    if (!connection) {
      const log = await readFile(path.join(dir, "mysql.log"), "utf8").catch(
        () => "",
      );
      console.error(
        log
          .replaceAll(password, "[redacted]")
          .split("\n")
          .slice(-12)
          .join("\n"),
      );
    }
    throw e;
  } finally {
    if (connection) {
      await connection.query("SHUTDOWN").catch(() => {});
      await connection.end().catch(() => {});
    }
    if (server) {
      const timeout = setTimeout(() => server.child.kill(), 6000);
      try {
        await server.done;
      } finally {
        clearTimeout(timeout);
      }
    }
    const target = await realpath(dir);
    if (
      path.dirname(target) === base &&
      path.basename(target).startsWith("hsupick-db-test-")
    )
      await rm(target, { recursive: true, maxRetries: 3 });
  }
}
