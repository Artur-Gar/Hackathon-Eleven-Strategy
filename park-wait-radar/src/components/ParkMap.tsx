import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { ATTRACTIONS, getWaitTime, getWaitColor, getWaitLabel } from "@/data/attractions";
import { getRealWaitTime, hasRealData } from "@/data/waitTimeData";
import { RouteStep } from "@/utils/routeOptimizer";
import { format } from "date-fns";

// Fix default marker icon
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface ParkMapProps {
  selectedDate: Date;
  slotIndex: number;
  routeSteps: RouteStep[];
}

export function ParkMap({ selectedDate, slotIndex, routeSteps }: ParkMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heatLayerRef = useRef<L.Layer | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const routeMarkersRef = useRef<L.Marker[]>([]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [41.087, 1.157],
      zoom: 16,
      zoomControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update heatmap + markers on date/slot change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old heat layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    // Remove old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    // Build heat data
    const heatData: [number, number, number][] = [];
    const newMarkers: L.CircleMarker[] = [];

    const useReal = hasRealData(dateStr);

    ATTRACTIONS.forEach((attr) => {
      const wait = useReal
        ? (getRealWaitTime(attr.id, dateStr, slotIndex) ?? 0)
        : getWaitTime(attr.id, dateStr, slotIndex);
      const intensity = Math.min(wait / 40, 1);
      const color = getWaitColor(wait);
      const label = getWaitLabel(wait);

      heatData.push([attr.lat, attr.lng, intensity]);

      // Circle marker for each attraction
      const circle = L.circleMarker([attr.lat, attr.lng], {
        radius: 10,
        fillColor: color,
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.9,
      }).addTo(map);

      circle.bindTooltip(attr.name, { sticky: true, className: "park-tooltip" });
      circle.bindPopup(
        `<div style="font-family: 'Montserrat', sans-serif; min-width: 160px;">
          <b style="font-size: 14px;">${attr.name}</b><br>
          <span style="color: #666; font-size: 12px;">Area: ${attr.area}</span><br>
          <div style="margin-top: 6px; padding: 4px 8px; border-radius: 4px; background: ${color}20; border-left: 3px solid ${color};">
            <span style="font-size: 18px; font-weight: 700; color: ${color};">${wait} min</span>
            <span style="font-size: 11px; color: #666; margin-left: 4px;">${label}</span>
          </div>
        </div>`
      );

      newMarkers.push(circle);
    });

    markersRef.current = newMarkers;

    // Add heat layer
    const heat = (L as any).heatLayer(heatData, {
      radius: 35,
      blur: 25,
      maxZoom: 18,
      max: 1,
      gradient: {
        0.0: "#2ecc40",
        0.25: "#f1c40f",
        0.5: "#e67e22",
        0.75: "#e74c3c",
        1.0: "#8b1a1a",
      },
    });
    heat.addTo(map);
    heatLayerRef.current = heat;
  }, [dateStr, slotIndex]);

  // Draw route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old route
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    routeMarkersRef.current.forEach((m) => map.removeLayer(m));
    routeMarkersRef.current = [];

    if (routeSteps.length < 2) return;

    const coords: L.LatLngExpression[] = routeSteps.map((step) => {
      const attr = ATTRACTIONS.find((a) => a.id === step.attractionId)!;
      return [attr.lat, attr.lng];
    });

    const polyline = L.polyline(coords, {
      color: "hsl(215, 60%, 50%)",
      weight: 3,
      opacity: 0.8,
      dashArray: "8, 6",
    }).addTo(map);
    routeLayerRef.current = polyline;

    // Number markers
    routeSteps.forEach((step, i) => {
      const attr = ATTRACTIONS.find((a) => a.id === step.attractionId)!;
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:20px;height:20px;border-radius:50%;
          background:hsl(215,60%,50%);color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;font-family:Montserrat,sans-serif;
          border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);
        ">${i + 1}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marker = L.marker([attr.lat, attr.lng], { icon, interactive: false }).addTo(map);
      routeMarkersRef.current.push(marker);
    });
  }, [routeSteps]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-lg overflow-hidden"
      style={{ minHeight: "400px" }}
    />
  );
}
