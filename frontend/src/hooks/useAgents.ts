"use client";

import { useQuery } from "@tanstack/react-query";
import { publicClient } from "@/lib/publicClient";
import { PROTOCOL_ABI } from "@/lib/abi";
import { PROTOCOL_ADDRESS } from "@/lib/constants";
import { fetchRegisteredAgentAddresses, fetchDelegationEvents } from "@/lib/utils";
import type { AgentWithIdentity, DelegationRecord } from "@/lib/types";

async function fetchAgents(): Promise<AgentWithIdentity[]> {
  // 1. Get all agent addresses from Mirror Node events
  const addresses = await fetchRegisteredAgentAddresses();
  if (addresses.length === 0) return [];

  // 2. Fetch identity + escrow for each agent in parallel
  const agents = await Promise.allSettled(
    addresses.map(async (addr): Promise<AgentWithIdentity> => {
      const hexAddr = addr as `0x${string}`;
      const [identity, escrow] = await Promise.all([
        publicClient.readContract({
          address: PROTOCOL_ADDRESS,
          abi: PROTOCOL_ABI,
          functionName: "getAgentIdentity",
          args: [hexAddr],
        }),
        publicClient.readContract({
          address: PROTOCOL_ADDRESS,
          abi: PROTOCOL_ABI,
          functionName: "getAgentEscrow",
          args: [hexAddr],
        }),
      ]);

      return {
        address: addr,
        identity: {
          agentAddress: identity.agentAddress,
          metadataURI: identity.metadataURI,
          registrationTime: identity.registrationTime,
          reputationScore: identity.reputationScore,
          totalTrades: identity.totalTrades,
          profitableTrades: identity.profitableTrades,
        },
        escrow,
      };
    })
  );

  return agents
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<AgentWithIdentity>).value)
    .sort(
      (a, b) =>
        Number(b.identity.reputationScore) - Number(a.identity.reputationScore)
    );
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
    staleTime: 60_000, // agents change less frequently
  });
}

async function fetchDelegations(): Promise<DelegationRecord[]> {
  return fetchDelegationEvents();
}

export function useDelegations() {
  return useQuery({
    queryKey: ["delegations"],
    queryFn: fetchDelegations,
    staleTime: 60_000,
  });
}

/** Delegations to a specific agent */
export function useDelegationsForAgent(agentAddress: string | undefined) {
  return useQuery({
    queryKey: ["delegations", agentAddress],
    queryFn: async () => {
      const all = await fetchDelegationEvents();
      return all.filter(
        (d) => d.delegate.toLowerCase() === agentAddress?.toLowerCase()
      );
    },
    enabled: !!agentAddress,
    staleTime: 60_000,
  });
}
