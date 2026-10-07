"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createClientLocation,
  deleteClientLocation,
  updateClientLocation,
} from "@/server/actions/clients";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type LocationRow = {
  id: string;
  label: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  isPrimary: boolean;
  notes: string | null;
};

export function ClientLocationsCard({
  clientId,
  locations,
  canEdit,
}: {
  clientId: string;
  locations: LocationRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Default collapsed — Syncro can auto-create many locations per client.
  // Click the header to expand the list. The summary in the header still
  // shows count + primary so it's useful when collapsed.
  const [expanded, setExpanded] = useState(false);
  const primary = locations.find((l) => l.isPrimary) ?? locations[0];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-start gap-2 text-left"
          aria-expanded={expanded}
          aria-controls="client-locations-content"
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <CardTitle>Locations</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {locations.length} item{locations.length === 1 ? "" : "s"}
              {primary && ` · primary: ${primary.label}`}
              {!expanded && locations.length > 0 && " · click to expand"}
            </p>
          </div>
        </button>
        {canEdit && expanded && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> Add Location
          </Button>
        )}
      </CardHeader>
      {expanded && (
        <CardContent id="client-locations-content" className="space-y-3">
          {adding && (
            <LocationForm
              clientId={clientId}
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          )}
          {locations.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground">No locations yet.</p>
          )}
          <ul className="divide-y">
            {locations.map((l) =>
              editingId === l.id ? (
                <li key={l.id} className="py-3">
                  <LocationForm
                    clientId={clientId}
                    location={l}
                    onDone={() => setEditingId(null)}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <LocationRowView
                  key={l.id}
                  clientId={clientId}
                  location={l}
                  canEdit={canEdit}
                  onEdit={() => setEditingId(l.id)}
                />
              ),
            )}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function LocationRowView({
  clientId,
  location,
  canEdit,
  onEdit,
}: {
  clientId: string;
  location: LocationRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Remove "${location.label}"?`)) return;
    start(async () => {
      const r = await deleteClientLocation({ locationId: location.id, clientId });
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success("Location removed");
        router.refresh();
      }
    });
  };

  const cityRegion = [location.city, location.region].filter(Boolean).join(", ");
  const addressBlock = [
    location.addressLine1,
    location.addressLine2,
    [cityRegion, location.postalCode].filter(Boolean).join(" "),
    location.country,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{location.label}</span>
          {location.isPrimary && (
            <Badge variant="secondary" className="text-[10px]">
              <Star className="mr-1 size-3" /> Primary
            </Badge>
          )}
        </div>
        {addressBlock && (
          <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
            {addressBlock}
          </pre>
        )}
        {location.notes && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {location.notes}
          </p>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={remove}
            disabled={pending}
            aria-label="Remove location"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function LocationForm({
  clientId,
  location,
  onDone,
  onCancel,
}: {
  clientId: string;
  location?: LocationRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [label, setLabel] = useState(location?.label ?? "");
  const [addressLine1, setAddressLine1] = useState(location?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(location?.addressLine2 ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [region, setRegion] = useState(location?.region ?? "");
  const [postalCode, setPostalCode] = useState(location?.postalCode ?? "");
  const [country, setCountry] = useState(location?.country ?? "US");
  const [isPrimary, setIsPrimary] = useState(location?.isPrimary ?? false);
  const [notes, setNotes] = useState(location?.notes ?? "");

  const submit = () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    start(async () => {
      const payload = {
        clientId,
        label: label.trim(),
        addressLine1: addressLine1.trim() || null,
        addressLine2: addressLine2.trim() || null,
        city: city.trim() || null,
        region: region.trim() || null,
        postalCode: postalCode.trim() || null,
        country: country.trim() || "US",
        isPrimary,
        notes: notes.trim() || null,
      };
      const r = location
        ? await updateClientLocation({ ...payload, locationId: location.id })
        : await createClientLocation(payload);
      if (r?.serverError) toast.error(r.serverError);
      else {
        toast.success(location ? "Location updated" : "Location added");
        onDone();
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="HQ, Warehouse, etc."
          />
        </div>
        <div>
          <Label>Country</Label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Address line 1</Label>
          <Input
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Address line 2</Label>
          <Input
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
          />
        </div>
        <div>
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <Label>State / region</Label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div>
          <Label>Postal code</Label>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
        />
        Primary location
      </label>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          <X className="mr-1 size-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : location ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
