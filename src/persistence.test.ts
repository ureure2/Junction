import { it, expect } from "vitest";
import { Persistence } from "./persistence";
it("이전 저장이 느려도 최종 메모가 마지막에 저장된다", async () => {
  const values: string[] = [];
  let release!: () => void;
  const store = new Persistence<string>(
    async (value) => {
      if (value === "old")
        await new Promise<void>((r) => {
          release = r;
        });
      values.push(value);
    },
    () => {},
  );
  store.schedule("old");
  const first = store.flush();
  await Promise.resolve();
  await Promise.resolve();
  store.schedule("latest");
  const last = store.flush();
  release();
  await first;
  await last;
  expect(values).toEqual(["old", "latest"]);
});
it("저장 실패 뒤 재시도할 수 있다", async () => {
  let failure = true;
  let result = "";
  const states: string[] = [];
  const store = new Persistence<string>(
    async (value) => {
      if (failure) throw new Error("disk");
      result = value;
    },
    (state) => states.push(state),
  );
  store.schedule("memo");
  await expect(store.flush()).rejects.toThrow("disk");
  failure = false;
  await store.flush();
  expect(result).toBe("memo");
  expect(states).toEqual(["pending", "error", "saved"]);
});
