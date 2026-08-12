CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  endereco text,
  telefone text,
  website text,
  cidade text,
  segmento text,
  place_id text UNIQUE,
  latitude double precision,
  longitude double precision,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select_staff" ON public.companies
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "companies_insert_staff" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "companies_update_staff" ON public.companies
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "companies_delete_admin" ON public.companies
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'administrador'));

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cargo text,
  email text,
  telefone text,
  linkedin_url text,
  apollo_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contacts_company_id_idx ON public.contacts(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select_staff" ON public.contacts
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "contacts_insert_staff" ON public.contacts
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "contacts_update_staff" ON public.contacts
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "contacts_delete_admin" ON public.contacts
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'administrador'));

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();