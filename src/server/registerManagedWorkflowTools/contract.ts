import { MANAGED_WORKFLOW_TOOL_CONTRACTS } from "../../contracts/managed/managedWorkflowToolContracts.js";

/** Locate one managed workflow tool contract by exact name. */
export const managedWorkflowContract = <
  Name extends (typeof MANAGED_WORKFLOW_TOOL_CONTRACTS)[number]["name"],
>(
  name: Name,
): Extract<
  (typeof MANAGED_WORKFLOW_TOOL_CONTRACTS)[number],
  { readonly name: Name }
> => {
  const found = MANAGED_WORKFLOW_TOOL_CONTRACTS.find(
    (
      candidate,
    ): candidate is Extract<
      (typeof MANAGED_WORKFLOW_TOOL_CONTRACTS)[number],
      { readonly name: Name }
    > => candidate.name === name,
  );
  if (found === undefined) throw new Error(`Missing ${name} contract`);
  return found;
};
