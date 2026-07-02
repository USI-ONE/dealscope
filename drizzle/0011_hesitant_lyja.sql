ALTER TABLE "licenses" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vbill_lines_client_idx" ON "vendor_bill_lines" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "vbill_lines_location_idx" ON "vendor_bill_lines" USING btree ("location_id");