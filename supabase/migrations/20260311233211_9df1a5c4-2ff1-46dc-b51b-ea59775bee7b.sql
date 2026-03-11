
-- Enable realtime for hotel dashboard tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_tasks;
