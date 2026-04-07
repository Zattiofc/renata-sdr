
-- Function to auto-create appointment when deal moves to "Pagamento Efetuado"
CREATE OR REPLACE FUNCTION public.auto_create_appointment_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contact RECORD;
  v_items TEXT := '';
  v_memory JSONB;
  v_delivery_date DATE;
  v_delivery_time TIME;
  v_description TEXT;
  v_title TEXT;
  v_item RECORD;
BEGIN
  -- Only fire when stage changes TO 'Pagamento Efetuado' (or similar)
  IF NEW.stage IS DISTINCT FROM OLD.stage 
     AND LOWER(TRIM(NEW.stage)) IN ('pagamento efetuado', 'pagamento_efetuado', 'pago') THEN

    -- Get contact info
    SELECT name, call_name, phone_number, client_memory, email
    INTO v_contact
    FROM public.contacts
    WHERE id = NEW.contact_id;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_memory := COALESCE(v_contact.client_memory, '{}'::jsonb);

    -- Build items list from inventory_movements
    FOR v_item IN
      SELECT i.product_name, im.quantity, i.price
      FROM public.inventory_movements im
      JOIN public.inventory i ON i.id = im.inventory_id
      WHERE im.contact_id = NEW.contact_id
      ORDER BY im.created_at DESC
      LIMIT 20
    LOOP
      v_items := v_items || '• ' || v_item.quantity || 'x ' || v_item.product_name || ' (R$ ' || ROUND(v_item.price * v_item.quantity, 2) || ')' || E'\n';
    END LOOP;

    IF v_items = '' THEN
      v_items := '(Sem itens registrados)';
    END IF;

    -- Try to extract delivery date from client_memory
    v_delivery_date := CURRENT_DATE + INTERVAL '1 day';
    v_delivery_time := '10:00'::TIME;

    -- Check if there's a scheduled date in memory
    IF v_memory->'sales_intelligence'->>'delivery_date' IS NOT NULL THEN
      BEGIN
        v_delivery_date := (v_memory->'sales_intelligence'->>'delivery_date')::DATE;
      EXCEPTION WHEN OTHERS THEN
        v_delivery_date := CURRENT_DATE + INTERVAL '1 day';
      END;
    END IF;

    IF v_memory->'sales_intelligence'->>'delivery_time' IS NOT NULL THEN
      BEGIN
        v_delivery_time := (v_memory->'sales_intelligence'->>'delivery_time')::TIME;
      EXCEPTION WHEN OTHERS THEN
        v_delivery_time := '10:00'::TIME;
      END;
    END IF;

    v_title := 'Pedido: ' || COALESCE(v_contact.name, v_contact.call_name, 'Cliente') || ' - ' || LEFT(REPLACE(v_items, E'\n', ', '), 100);
    
    v_description := 'PEDIDO CONFIRMADO ✅' || E'\n\n'
      || '📦 Itens:' || E'\n' || v_items || E'\n'
      || '💰 Total: R$ ' || COALESCE(NEW.value, 0) || E'\n'
      || '📱 Telefone: ' || COALESCE(v_contact.phone_number, 'N/A') || E'\n'
      || '📧 Email: ' || COALESCE(v_contact.email, 'N/A') || E'\n'
      || '🏠 Endereço: ' || COALESCE(v_memory->'sales_intelligence'->>'delivery_address', 'Não informado');

    INSERT INTO public.appointments (
      title, date, time, duration, type, description, 
      contact_id, status, user_id,
      metadata
    ) VALUES (
      v_title,
      v_delivery_date,
      v_delivery_time,
      60,
      'meeting',
      v_description,
      NEW.contact_id,
      'scheduled',
      NEW.user_id,
      jsonb_build_object('source', 'nina_ai', 'deal_id', NEW.id, 'auto_created', true)
    );

  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger on deals table
DROP TRIGGER IF EXISTS auto_appointment_on_payment ON public.deals;
CREATE TRIGGER auto_appointment_on_payment
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_appointment_on_payment();
