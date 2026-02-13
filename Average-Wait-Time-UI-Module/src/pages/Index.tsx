import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/park/Header";
import { FileUploader } from "@/components/park/FileUploader";
import { AdminPanel } from "@/components/park/AdminPanel";
import { RideTile } from "@/components/park/RideTile";
import { processCSVData, parseGzippedCSV, parseCSVText, RawRow, RideData } from "@/lib/DataProcessor";

const Index = () => {
  const [rides, setRides] = useState<RideData[]>([]);
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const handleDataLoaded = useCallback((rows: RawRow[]) => {
    const processed = processCSVData(rows);
    setRides(processed);
    setHasData(true);
    setOverrides({});
  }, []);

  const handleOverrideChange = useCallback((rideName: string, available: boolean) => {
    setOverrides((prev) => ({ ...prev, [rideName]: available }));
  }, []);

  // Apply overrides to rides
  const displayRides = rides.map((ride) => {
    if (overrides[ride.name] !== undefined) {
      return { ...ride, available: overrides[ride.name] };
    }
    return ride;
  });

  // Load bundled sample data on mount
  useEffect(() => {
    async function loadSample() {
      try {
        const response = await fetch("/sample-data.csv.gz");
        if (!response.ok) throw new Error("No sample data");
        const text = await response.text();
        let rows: RawRow[];
        try {
          rows = await parseCSVText(text);
        } catch {
          const resp2 = await fetch("/sample-data.csv.gz");
          const buffer = await resp2.arrayBuffer();
          rows = await parseGzippedCSV(buffer);
        }
        handleDataLoaded(rows);
      } catch {
        // No sample data, user must upload
      } finally {
        setLoading(false);
      }
    }
    loadSample();
  }, [handleDataLoaded]);

  return (
    <div className="min-h-screen bg-background">
      <Header onAdminClick={() => setAdminOpen(true)} />

      <AdminPanel
        open={adminOpen}
        onOpenChange={setAdminOpen}
        rides={rides}
        onDataLoaded={handleDataLoaded}
        hasData={hasData}
        overrides={overrides}
        onOverrideChange={handleOverrideChange}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-3 border-park-accent border-t-transparent rounded-full" />
        </div>
      ) : displayRides.length > 0 ? (
        <main className="max-w-5xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayRides.map((ride) => (
              <RideTile key={ride.name} ride={ride} />
            ))}
          </div>
        </main>
      ) : (
        !hasData && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="font-bold text-lg">No ride data loaded</p>
            <p className="text-sm">Upload a CSV file to get started</p>
          </div>
        )
      )}
    </div>
  );
};

export default Index;
