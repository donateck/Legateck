-- ============================================================
-- LEGATECK · Bóveda Legal + Base de Conocimiento RAG
-- Migración: 20260527000001
-- ============================================================

-- ── 1. STORAGE BUCKET: legal_vault (PDFs de leyes panameñas) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legal_vault',
  'legal_vault',
  false,
  52428800,   -- 50 MB por archivo
  ARRAY['application/pdf','text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- RLS para legal_vault: solo service role puede leer (backend)
CREATE POLICY "legal_vault_service_read"
  ON storage.objects FOR SELECT
  TO service_role
  USING (bucket_id = 'legal_vault');

CREATE POLICY "legal_vault_service_insert"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'legal_vault');

-- ── 2. TABLA: legal_knowledge_base ──────────────────────────
CREATE TABLE IF NOT EXISTS public.legal_knowledge_base (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  content     text        NOT NULL,
  source_pdf  text        NOT NULL,
  law_type    text        NOT NULL,
  article_ref text,
  fts_vector  tsvector    GENERATED ALWAYS AS (
                to_tsvector('spanish',
                  coalesce(title, '') || ' ' ||
                  coalesce(article_ref, '') || ' ' ||
                  coalesce(content, ''))
              ) STORED,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS legal_kb_fts_idx
  ON public.legal_knowledge_base USING GIN(fts_vector);
CREATE INDEX IF NOT EXISTS legal_kb_law_type_idx
  ON public.legal_knowledge_base(law_type);
CREATE INDEX IF NOT EXISTS legal_kb_source_idx
  ON public.legal_knowledge_base(source_pdf);

-- RLS
ALTER TABLE public.legal_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Lectura pública (anon + authenticated): es doctrina oficial panameña
CREATE POLICY "legal_kb_select_all"
  ON public.legal_knowledge_base FOR SELECT
  USING (true);

-- Solo service_role puede insertar/modificar/eliminar
CREATE POLICY "legal_kb_service_write"
  ON public.legal_knowledge_base FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- GRANTs
GRANT SELECT ON public.legal_knowledge_base TO anon, authenticated;
GRANT ALL    ON public.legal_knowledge_base TO service_role;

-- ── 3. FUNCIÓN: búsqueda FTS con ranking ─────────────────────
CREATE OR REPLACE FUNCTION public.search_legal_knowledge(
  query_text  text,
  p_law_type  text    DEFAULT NULL,
  p_limit     integer DEFAULT 5
)
RETURNS TABLE (
  id          uuid,
  title       text,
  content     text,
  source_pdf  text,
  law_type    text,
  article_ref text,
  rank        real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tsq tsquery;
BEGIN
  -- Convertir texto libre a tsquery (OR entre palabras)
  BEGIN
    tsq := plainto_tsquery('spanish', query_text);
  EXCEPTION WHEN OTHERS THEN
    tsq := plainto_tsquery('simple', query_text);
  END;

  IF tsq IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lkb.id,
    lkb.title,
    lkb.content,
    lkb.source_pdf,
    lkb.law_type,
    lkb.article_ref,
    ts_rank_cd(lkb.fts_vector, tsq, 32)::real AS rank
  FROM public.legal_knowledge_base lkb
  WHERE
    lkb.fts_vector @@ tsq
    AND (p_law_type IS NULL OR lkb.law_type = p_law_type)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_legal_knowledge TO anon, authenticated, service_role;

-- ── 4. SEED: Ley 81 de 2019 — Protección de Datos Personales ─
INSERT INTO public.legal_knowledge_base (title, content, source_pdf, law_type, article_ref) VALUES

-- OBJETO Y ALCANCE
('Ley 81 — Objeto y ámbito de aplicación',
'Esta Ley tiene por objeto establecer los principios, derechos, obligaciones y procedimientos que regulan la protección de datos personales, considerando su interrelación con la vida privada y demás derechos y libertades fundamentales de los ciudadanos, por parte de las personas naturales o jurídicas, de derecho público o privado, lucrativas o no, que traten datos personales en los términos previstos en esta Ley. Toda persona, natural o jurídica, puede efectuar el tratamiento de datos personales, siempre que lo haga con arreglo a la presente Ley y para los fines permitidos en el ordenamiento jurídico.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 1'),

-- PRINCIPIOS
('Ley 81 — Principios generales de protección de datos',
'Los principios que rigen la protección de datos personales son: 1. Principio de lealtad: los datos deben recabarse sin engaño. 2. Principio de finalidad: los datos deben recolectarse con fines determinados y no usarse para fines incompatibles. 3. Principio de proporcionalidad: solo se solicitarán los datos mínimos necesarios. 4. Principio de veracidad: los datos serán exactos y actualizados. 5. Principio de seguridad: el responsable adoptará medidas técnicas y organizativas para proteger los datos, especialmente los sensibles, e informará al titular si hay vulneración. 6. Principio de transparencia: la comunicación al titular será en lenguaje sencillo y claro, informando los derechos ARCO. 7. Principio de confidencialidad: las personas involucradas en el tratamiento guardarán secreto, incluso después de terminar su relación. 8. Principio de licitud: el tratamiento debe contar con consentimiento previo, informado e inequívoco o fundamento legal. 9. Principio de portabilidad: el titular puede obtener copia de sus datos en formato genérico.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 2'),

-- DEFINICIONES CLAVE
('Ley 81 — Definiciones: consentimiento, dato sensible, dato personal',
'Consentimiento: manifestación de la voluntad del titular mediante la cual se efectúa el tratamiento de sus datos. Dato personal: cualquier información concerniente a personas naturales que las identifica o hace identificables. Dato sensible: aquel que refiere a la esfera íntima del titular o cuya utilización indebida pueda causar discriminación o riesgo grave. Son sensibles: origen racial o étnico, creencias religiosas, filosóficas o morales, afiliación sindical, opiniones políticas, datos de salud, vida, preferencia u orientación sexual, datos genéticos o biométricos. Dato anónimo: aquel cuya identidad no puede establecerse por medios razonables. Responsable del tratamiento: persona natural o jurídica que determina los fines, medios y alcance del tratamiento. Titular de los datos: persona natural a quien se refieren los datos. Transferencia de datos: dar a conocer, divulgar, comunicar o transmitir datos a personas distintas del titular, intra o extrafronterizo.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 4'),

-- CONDICIONES PARA TRATAMIENTO LÍCITO
('Ley 81 — Condiciones para el tratamiento lícito de datos (consentimiento)',
'El tratamiento de datos personales solo podrá realizarse cuando se cumpla al menos una de estas condiciones: 1. Que se obtenga el consentimiento del titular. 2. Que sea necesario para la ejecución de un contrato donde el titular sea parte. 3. Que sea necesario para el cumplimiento de una obligación legal. 4. Que esté autorizado por una ley especial. La persona que consienta debe ser informada del propósito del uso de sus datos. El consentimiento podrá obtenerse de forma que permita su trazabilidad (electrónica o física) y podrá ser revocado sin efecto retroactivo. Para datos sensibles de salud, el consentimiento será previo, irrefutable y expreso.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 6'),

-- EXCEPCIONES A LA AUTORIZACIÓN
('Ley 81 — Casos que no requieren autorización expresa',
'No se requiere autorización para el tratamiento de datos en los casos siguientes: 1. Datos provenientes de fuentes de dominio público. 2. Datos recolectados por la Administración Pública en el ámbito de sus competencias. 3. Datos económicos, financieros, bancarios o comerciales con consentimiento previo. 4. Datos en listas de categorías de personas (profesión, actividad, dirección). 5. Datos necesarios dentro de una relación comercial establecida para atención directa o venta de servicios. 6. Tratamiento por organizaciones privadas para uso exclusivo de sus asociados con fines estadísticos. 7. Casos de urgencia médica o sanitaria. 8. Tratamiento autorizado por ley para fines históricos, estadísticos o científicos. 9. Intereses legítimos del responsable, siempre que no prevalezcan sobre los derechos fundamentales del interesado.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 8'),

-- FINALIDAD Y USO DE DATOS
('Ley 81 — Principio de finalidad y limitación de uso',
'Los datos personales deben utilizarse para los fines determinados, explícitos y lícitos para los cuales fueron autorizados al momento de su recolección. Para cualquier otro uso será necesario obtener el consentimiento del titular, que exista una ley especial que lo permita, o que sea necesario para el cumplimiento de una obligación contractual donde el titular sea parte, o que sea requerido por entidad pública en el ejercicio de sus funciones legales o por orden judicial.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 11'),

-- DATOS SENSIBLES — TRANSFERENCIA
('Ley 81 — Prohibición de transferencia de datos sensibles',
'Los datos sensibles no pueden ser objeto de transferencia, excepto en los casos siguientes: 1. Cuando el titular haya dado su autorización explícita. 2. Cuando sea necesario para salvaguardar la vida del titular que se encuentre incapacitado. 3. Cuando los datos sean necesarios para el reconocimiento, ejercicio o defensa de un derecho en proceso judicial con autorización judicial competente. 4. Cuando tenga finalidad histórica, estadística o científica, adoptando medidas para disociar la identidad del titular.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 13'),

-- DERECHOS ARCO
('Ley 81 — Derechos ARCO: acceso, rectificación, cancelación y oposición',
'Se reconocen como derechos irrenunciables básicos de los titulares: 1. Derecho de acceso: obtener sus datos almacenados en bases de datos públicas o privadas y conocer el origen y finalidad del tratamiento. 2. Derecho de rectificación: solicitar corrección de datos incorrectos, incompletos, inexactos o falsos. 3. Derecho de cancelación: solicitar eliminación de datos incorrectos, irrelevantes o caducos. 4. Derecho de oposición: negarse a proporcionar datos o revocar consentimiento por motivos fundados. 5. Derecho de portabilidad: obtener copia de sus datos en formato genérico y de uso común para transmitirlos a otro responsable. Estos derechos son irrenunciables y no pueden ser limitados por contrato; cualquier acto de limitación es nulo.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 15'),

-- PLAZOS Y GRATUIDAD
('Ley 81 — Plazo de respuesta 10 días hábiles y gratuidad',
'El titular o su representante podrá solicitar información a los responsables del tratamiento, la cual deberá ser proporcionada en un plazo no mayor de diez (10) días hábiles desde la fecha de presentación de la solicitud. El titular tendrá derecho a exigir que se eliminen sus datos cuando su almacenamiento carezca de fundamento legal, no hayan sido expresamente autorizados o estuvieran caducos. El suministro de información, la modificación, bloqueo o eliminación de datos personales será absolutamente gratuito. Si el responsable no responde en el plazo establecido, el titular tiene derecho a recurrir a la Autoridad Nacional de Transparencia y Acceso a la Información (ANTAI).',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículos 16-18'),

-- TRANSFERENCIA INTERNACIONAL
('Ley 81 — Transferencia internacional de datos personales',
'El almacenamiento o transferencia de datos personales confidenciales, sensibles o restringidos que reciban tratamiento transfronterizo será permitido siempre que el responsable cumpla con los estándares de esta Ley o demuestre estándares iguales o superiores. Una transferencia es lícita si: el titular consintió; el país receptor provee protección equivalente o superior; está prevista en ley o tratado en que Panamá sea parte; es necesaria para contrato en interés del titular; es requerida para asistencia sanitaria; es efectuada a sociedad del mismo grupo económico para fines no distintos a los originales; es necesaria para proceso judicial; es requerida para transferencias bancarias o bursátiles. El responsable y el receptor son responsables solidarios por la licitud del tratamiento.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículos 5, 31, 33'),

-- REGISTRO DE TRANSFERENCIAS
('Ley 81 — Obligación de llevar registro de transferencias a terceros',
'Los responsables y custodios de bases de datos que transfieran datos a terceros llevarán un registro detallado disponible para la ANTAI. El registro debe contener: identificación de la base de datos y su responsable, naturaleza de los datos, fundamento jurídico, procedimientos de obtención y tratamiento, destino de los datos y personas a quienes pueden transferirse, medidas de seguridad, forma en que el titular puede acceder a sus datos, procedimientos de rectificación, tiempo de conservación y cualquier cambio. Se debe registrar la identificación de todas las personas que accedieron a los datos dentro de los quince (15) días hábiles desde que inicia la actividad.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 31'),

-- INTERNET Y POLÍTICA DE PRIVACIDAD
('Ley 81 — Obligaciones para recolección de datos por Internet',
'Cuando la recolección se realice a través de Internet u otro medio digital, las obligaciones se completarán mediante la presentación al interesado de las políticas de privacidad y/o condiciones de servicio accesibles. Si el consentimiento se da en una declaración escrita que también se refiera a otros asuntos, la solicitud de consentimiento se presentará de forma que se distinga claramente, en lenguaje claro y sencillo. Ninguna parte de la declaración que constituya infracción a la Ley será vinculante.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículo 27'),

-- SANCIONES — CLASIFICACIÓN
('Ley 81 — Clasificación de infracciones: leves, graves y muy graves',
'Las infracciones se clasifican en: LEVES: no remitir información a la ANTAI dentro de los plazos requeridos. GRAVES: (1) tratar datos personales sin consentimiento del titular; (2) infringir principios y garantías de la Ley; (3) infringir el deber de confidencialidad; (4) restringir los derechos de acceso, rectificación, cancelación u oposición; (5) no informar al titular del tratamiento cuando los datos no fueron obtenidos de él directamente; (6) almacenar datos sin condiciones adecuadas de seguridad; (7) no atender requerimientos de la ANTAI; (8) entorpecer funciones de inspección de la ANTAI. MUY GRAVES: (1) recopilar datos en forma dolosa; (2) no observar regulaciones sobre datos sensibles; (3) no suspender el tratamiento cuando la ANTAI lo requiera; (4) almacenar o transferir internacionalmente datos violando esta Ley; (5) reincidir en faltas graves.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículos 38-41'),

-- SANCIONES — MONTOS Y CONSECUENCIAS
('Ley 81 — Sanciones económicas y consecuencias por incumplimiento',
'Las sanciones se gradúan según la gravedad: FALTA LEVE: citación ante la ANTAI. FALTAS GRAVES: multas según proporcionalidad, entre B/.1,000.00 y B/.10,000.00 balboas. FALTAS MUY GRAVES: (a) clausura de los registros de la base de datos, previa opinión formal del Consejo de Protección de Datos Personales; (b) suspensión e inhabilitación temporal o permanente de la actividad de almacenamiento y tratamiento de datos. Se considera reincidencia cuando la misma falta se repite dentro de un período de tres años. El responsable del tratamiento deberá también indemnizar el daño patrimonial y/o moral causado por el tratamiento indebido. Los tribunales de justicia conocerán las demandas por daños y perjuicios.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículos 36-37, 43'),

-- VIGENCIA
('Ley 81 — Vigencia y ente fiscalizador (ANTAI)',
'La Ley 81 comenzó a regir a los dos años de su promulgación (publicada el 29 de marzo de 2019 en Gaceta Oficial 28743-A), es decir, desde el 29 de marzo de 2021. La autoridad competente para fiscalizar, supervisar y sancionar es la Autoridad Nacional de Transparencia y Acceso a la Información (ANTAI). El Consejo de Protección de Datos Personales actúa como ente consultivo. El Órgano Ejecutivo reglamenta la Ley en coordinación con la ANTAI. Las multas no pagadas se remiten para cobro a la Dirección General de Ingresos del Ministerio de Economía y Finanzas.',
'Ley_81_Proteccion_de_Datos_Panama.pdf', 'proteccion_datos', 'Artículos 34, 36, 45-47');
