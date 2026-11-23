"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "./auth";

/** Signs this browser out: deletes its session row and clears the cookie. */
export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
