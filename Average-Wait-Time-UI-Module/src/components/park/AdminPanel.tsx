import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileUploader } from "./FileUploader";
import { RawRow, RideData } from "@/lib/DataProcessor";
import { Lock } from "lucide-react";

interface AdminPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rides: RideData[];
  onDataLoaded: (rows: RawRow[]) => void;
  hasData: boolean;
  overrides: Record<string, boolean>;
  onOverrideChange: (rideName: string, available: boolean) => void;
}

const ADMIN_PASSWORD = "123";

export function AdminPanel({
  open,
  onOpenChange,
  rides,
  onDataLoaded,
  hasData,
  overrides,
  onOverrideChange,
}: AdminPanelProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthenticated(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setAuthenticated(false);
      setPassword("");
      setError(false);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock size={18} />
            Admin Panel
          </DialogTitle>
        </DialogHeader>

        {!authenticated ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                placeholder="Enter admin password"
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive font-semibold">
                  Incorrect password
                </p>
              )}
            </div>
            <Button type="submit" className="w-full">
              Unlock
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-sm mb-3">Upload CSV Data</h3>
              <FileUploader onDataLoaded={onDataLoaded} hasData={hasData} />
            </div>

            {rides.length > 0 && (
              <div>
                <h3 className="font-bold text-sm mb-3">Ride Availability</h3>
                <div className="space-y-3">
                  {rides.map((ride) => {
                    const isAvailable =
                      overrides[ride.name] !== undefined
                        ? overrides[ride.name]
                        : ride.available;
                    return (
                      <div
                        key={ride.name}
                        className="flex items-center justify-between gap-3"
                      >
                        <Label
                          htmlFor={`toggle-${ride.name}`}
                          className="text-sm font-medium truncate flex-1"
                        >
                          {ride.name}
                        </Label>
                        <Switch
                          id={`toggle-${ride.name}`}
                          checked={isAvailable}
                          onCheckedChange={(checked) =>
                            onOverrideChange(ride.name, checked)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
