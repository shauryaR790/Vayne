"use client";

import { useEffect, useState } from "react";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { PageHeader } from "@/components/shared/workspace-card";
import { ScansTable } from "@/components/dashboard/scans-table";

export function ScansPage() {
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listInvestigations()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
      <PageHeader
        title="Scans"
        subtitle="Recent scan activity across your attack surface"
      />
      <ScansTable
        items={items}
        loading={loading}
        filter={filter}
        onFilterChange={setFilter}
      />
    </div>
  );
}
