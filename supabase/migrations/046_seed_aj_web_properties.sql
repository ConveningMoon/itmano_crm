-- Migration 046: seed A&J web listings into properties
-- Migrates the 3 static listings from the A&J marketing site
-- (main-web-ajreg/src/data/listings.ts) into the CRM as published web
-- properties for tenant-aj. Idempotent via the (tenant_id, slug) unique
-- index from migration 045.

INSERT INTO properties (
  tenant_id, name, slug, neighborhood, state, property_type, status,
  list_price, address, city, sqft, bedrooms,
  bathrooms, bathrooms_full, bathrooms_half,
  year_built, garage_spaces,
  description_en, description_es, features_en, features_es,
  published_to_web
)
VALUES
(
  'tenant-aj', 'Oakmont Manor', 'oakmont-manor',
  'Norfolk, Granby Street Corridor', 'VA', 'residential', 'available',
  370000, '3033 Somme Avenue', 'Norfolk', 2092, 4,
  2.5, 2, 1,
  1998, 2,
  'Welcome to Oakmont Manor — a spacious four-bedroom home nestled in one of Norfolk''s most sought-after neighborhoods. This beautifully maintained property features an open-concept main floor with abundant natural light, an updated kitchen with granite countertops, and a generous primary suite with walk-in closet. The backyard offers a private retreat perfect for entertaining, while the two-car garage provides ample storage. Walking distance to top-rated schools, parks, and local dining.',
  'Bienvenido a Oakmont Manor — una espaciosa residencia de cuatro habitaciones en uno de los vecindarios más codiciados de Norfolk. Esta propiedad impecablemente mantenida cuenta con una planta principal de concepto abierto con abundante luz natural, cocina renovada con encimeras de granito y una suite principal generosa con vestidor. El jardín trasero ofrece un retiro privado ideal para reuniones, mientras que el garaje para dos vehículos brinda almacenamiento amplio. A pocos pasos de escuelas destacadas, parques y restaurantes locales.',
  ARRAY[
    'Updated kitchen with granite countertops and stainless appliances',
    'Primary suite with walk-in closet and en-suite bath',
    'Open-concept living and dining area',
    'Hardwood floors throughout main level',
    'Private fenced backyard with patio',
    'Two-car attached garage',
    'Central HVAC (2021)',
    'Zoned for top-rated Norfolk schools'
  ],
  ARRAY[
    'Cocina renovada con encimeras de granito y electrodomésticos de acero inoxidable',
    'Suite principal con vestidor y baño privado',
    'Sala y comedor de concepto abierto',
    'Pisos de madera en toda la planta principal',
    'Jardín trasero privado cercado con patio',
    'Garaje adjunto para dos vehículos',
    'Sistema de climatización central (2021)',
    'Asignado a escuelas de alto rendimiento de Norfolk'
  ],
  true
),
(
  'tenant-aj', 'Westfield House', 'westfield-house-locust',
  'Norfolk, Ghent / Park Place', 'VA', 'residential', 'available',
  299900, '3154 Locust Avenue', 'Norfolk', 1206, 4,
  2.0, 2, 0,
  1985, NULL,
  'A well-priced gem in a charming Norfolk neighborhood. This four-bedroom home offers a functional floor plan ideal for families or investors seeking strong rental potential in the Hampton Roads market. Recent updates include fresh interior paint, new flooring in the main living areas, and a refreshed kitchen. Conveniently located near major employers, military bases, and interstate access.',
  'Una joya bien tasada en un encantador vecindario de Norfolk. Esta residencia de cuatro habitaciones ofrece una distribución funcional ideal para familias o inversionistas que buscan un sólido potencial de renta en el mercado de Hampton Roads. Las mejoras recientes incluyen pintura interior nueva, pisos renovados en las áreas principales y cocina refrescada. Ubicada convenientemente cerca de grandes empleadores, bases militares y acceso a la interestatal.',
  ARRAY[
    'Four bedrooms on one level',
    'Two full bathrooms',
    'Updated flooring in living areas',
    'Refreshed kitchen cabinetry and fixtures',
    'Spacious backyard',
    'Close to military bases and employers',
    'Easy interstate access'
  ],
  ARRAY[
    'Cuatro habitaciones en un solo nivel',
    'Dos baños completos',
    'Pisos actualizados en áreas de estar',
    'Armarios y accesorios de cocina renovados',
    'Amplio jardín trasero',
    'Cerca de bases militares y empleadores',
    'Fácil acceso a la interestatal'
  ],
  true
),
(
  'tenant-aj', 'Westfield House', 'westfield-house-central',
  'Central Suffolk, Lloyd Place', 'VA', 'residential', 'available',
  149900, '307 Central Avenue', 'Suffolk', 840, 3,
  1.0, 1, 0,
  1972, NULL,
  'An affordable entry point into Suffolk''s growing real estate market. This cozy three-bedroom home is ideal for first-time buyers or investors looking to capitalize on the area''s rapid appreciation. The layout is efficient and livable, with a bright living space, eat-in kitchen, and a generous yard. Priced to move — don''t miss this opportunity.',
  'Una entrada asequible al creciente mercado inmobiliario de Suffolk. Esta acogedora residencia de tres habitaciones es ideal para compradores por primera vez o inversionistas que buscan capitalizar la rápida valorización de la zona. La distribución es eficiente y habitable, con una sala luminosa, cocina con comedor y un generoso jardín. Con un precio pensado para venderse pronto — no pierda esta oportunidad.',
  ARRAY[
    'Three bedrooms',
    'Eat-in kitchen',
    'Bright living area with large windows',
    'Generous backyard — ideal for outdoor living',
    'Low-maintenance exterior',
    'Priced below market for quick sale',
    'Near schools, shops, and transit'
  ],
  ARRAY[
    'Tres habitaciones',
    'Cocina con comedor',
    'Sala luminosa con ventanas amplias',
    'Amplio jardín trasero — ideal para vida al aire libre',
    'Exterior de bajo mantenimiento',
    'Precio por debajo del mercado para venta rápida',
    'Cerca de escuelas, tiendas y transporte'
  ],
  true
)
ON CONFLICT (tenant_id, slug) WHERE slug IS NOT NULL DO NOTHING;
