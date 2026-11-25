-- Persist each competition's default court and use it for generated games.
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS default_venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;

-- Existing competitions inherit the court already configured on their league.
UPDATE public.competitions c
   SET default_venue_id = l.default_venue_id
  FROM public.leagues l
 WHERE l.id = c.league_id
   AND c.default_venue_id IS NULL
   AND l.default_venue_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_competition_default_court()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.league_id IS DISTINCT FROM OLD.league_id
       AND NEW.default_venue_id IS NOT DISTINCT FROM OLD.default_venue_id THEN
      SELECT l.default_venue_id INTO NEW.default_venue_id
        FROM public.leagues l
       WHERE l.id = NEW.league_id
         AND l.organization_id = NEW.organization_id;
    ELSIF NEW.default_venue_id IS NULL THEN
      SELECT l.default_venue_id INTO NEW.default_venue_id
        FROM public.leagues l
       WHERE l.id = NEW.league_id
         AND l.organization_id = NEW.organization_id;
    END IF;
  ELSIF NEW.default_venue_id IS NULL THEN
    SELECT l.default_venue_id INTO NEW.default_venue_id
      FROM public.leagues l
     WHERE l.id = NEW.league_id
       AND l.organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS competition_default_court_from_league ON public.competitions;
CREATE TRIGGER competition_default_court_from_league
BEFORE INSERT OR UPDATE OF league_id ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.set_competition_default_court();

CREATE OR REPLACE FUNCTION public.set_game_default_court()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.venue_id IS NULL AND NEW.competition_id IS NOT NULL THEN
    SELECT c.default_venue_id INTO NEW.venue_id
      FROM public.competitions c
     WHERE c.id = NEW.competition_id
       AND c.organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS game_default_court_from_competition ON public.games;
CREATE TRIGGER game_default_court_from_competition
BEFORE INSERT ON public.games
FOR EACH ROW EXECUTE FUNCTION public.set_game_default_court();
