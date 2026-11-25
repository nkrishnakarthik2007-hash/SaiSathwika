insert into public.brands(name, description)
values ('Heritage', 'Dairy brand associated with the authorised outlet')
on conflict (name) do nothing;

insert into public.categories(name, sort_order) values
('Milk & Varieties', 1),
('Curd & Buttermilk', 2),
('Butter, Ghee & Paneer', 3),
('Ice Creams', 4),
('Sweets & Other Dairy Products', 5),
('Soft Drinks', 6)
on conflict (name) do nothing;
