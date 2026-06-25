
ALTER TABLE public.pastas
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.pastas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arquivada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pastas_parent_id_idx ON public.pastas(parent_id);

CREATE OR REPLACE FUNCTION public.pastas_check_ciclo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cur uuid;
  v_depth int := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Uma pasta não pode ser pai de si mesma';
  END IF;
  v_cur := NEW.parent_id;
  WHILE v_cur IS NOT NULL AND v_depth < 50 LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION 'Hierarquia de pastas criaria um ciclo';
    END IF;
    SELECT parent_id INTO v_cur FROM public.pastas WHERE id = v_cur;
    v_depth := v_depth + 1;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pastas_check_ciclo_trigger ON public.pastas;
CREATE TRIGGER pastas_check_ciclo_trigger
BEFORE INSERT OR UPDATE OF parent_id ON public.pastas
FOR EACH ROW EXECUTE FUNCTION public.pastas_check_ciclo();
