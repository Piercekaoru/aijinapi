import type { Metadata } from "next";
import { AccountClient } from "./account-client";

export const metadata: Metadata = {
  title: "账号与额度 | AIJinAPI",
};

export default function AccountPage() {
  return <AccountClient />;
}
