import { Client } from "pg";

import { databaseName } from "./test-database";

/**
 * Empties the tables between tests. Refuses to touch any database whose
 * name doesn't end in "_test", as a last safety net for real data.
 */
export async function resetDatabase(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!databaseName(url).endsWith("_test")) {
    throw new Error("Refusing to empty a database whose name doesn't end in _test");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      "TRUNCATE users, sessions, accounts, verifications, workspaces, memberships, invitations, properties, projects, rooms, project_rooms, openings, files, attachments, activity_events, budget_categories, budget_lines, budget_adjustments, budget_transfers, vendors, commitments, expenses, expense_allocations, payments, contractors, contractor_projects, communications, warranties, tasks, quotes, quote_revisions, contracts, price_items, room_estimates, room_estimate_areas, materials, orders, order_items, deliveries, delivery_items, order_returns, return_items, milestones, task_dependencies, appointments, reminders, documents, document_versions, design_boards, board_items, notifications CASCADE",
    );
  } finally {
    await client.end();
  }
}
