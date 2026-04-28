# Guia corta de importacion de clientes

## Objetivo
Esta guia explica como preparar y cargar clientes masivamente en Sistema Cresen usando un archivo `CSV` o `XLSX`.

## Ruta de importacion
La importacion se realiza en:

- `http://localhost:3000/clientes/importar`

## Plantillas oficiales
Puedes usar cualquiera de estas plantillas:

- `docs/clientes-import-template.csv`
- `docs/clientes-import-template.xlsx`
- `public/templates/clientes-import-template.csv`
- `public/templates/clientes-import-template.xlsx`

## Columnas exactas que espera hoy el importador
- `externalClientId`
- `code`
- `fullName`
- `phone`
- `secondaryPhone`
- `address`
- `postalCode`
- `neighborhood`
- `city`
- `state`
- `betweenStreets`
- `referencesNotes`
- `observations`
- `isActive`

## Campos obligatorios
Para que una fila sea valida deben venir correctamente:

- `externalClientId`
- `fullName`
- `phone`
- `address`
- `postalCode`

## Campos opcionales
Estos campos pueden venir vacios:

- `code`
- `secondaryPhone`
- `neighborhood`
- `city`
- `state`
- `betweenStreets`
- `referencesNotes`
- `observations`
- `isActive`

## Formato esperado por columna
- `externalClientId`: identificador externo del cliente en tu sistema anterior. Ejemplo: `CR0001`
- `code`: codigo interno actual del cliente. Si viene vacio, el sistema genera el siguiente consecutivo disponible.
- `fullName`: nombre completo del cliente. Se guarda en mayusculas.
- `phone`: telefono principal de 10 digitos. Se limpian caracteres extra.
- `secondaryPhone`: telefono secundario de 10 digitos, opcional.
- `address`: direccion del cliente. Se guarda en mayusculas.
- `postalCode`: codigo postal de 5 digitos.
- `neighborhood`: colonia, opcional.
- `city`: ciudad, opcional.
- `state`: estado, opcional.
- `betweenStreets`: entre calles, opcional.
- `referencesNotes`: referencias, opcional.
- `observations`: observaciones, opcional.
- `isActive`: puede venir como `true`, `false`, `1`, `0`, `si`, `sí`, `activo`.

## Ejemplos correctos
```csv
externalClientId,code,fullName,phone,secondaryPhone,address,postalCode,neighborhood,city,state,betweenStreets,referencesNotes,observations,isActive
CR0001,1,BENJAMIN MENDOZA PANDURO,9990000000,,CIRC JAZMIN 40,99999,VILLAS DEL ROBLE,TEPIC,NAYARIT,,,,true
CR0002,2,MARIA DEL CARMEN VALERIO X,9990000000,,PITAGORA 15,99999,ARAMARA,TEPIC,NAYARIT,,,,true
CR0003,3,CLAUDIA ELENA ALATORRE QUINTERO,9990000000,,VILLA DE VALENTINO 101,99999,VISTA DE LA CANTERA,TEPIC,NAYARIT,,,,true
```

## Reglas importantes
- `fullName`, `address`, `neighborhood`, `city`, `state`, `betweenStreets`, `referencesNotes` y `observations` se guardan en mayusculas.
- `phone` y `secondaryPhone` se limpian a solo numeros.
- `externalClientId` debe conservar el ID original si despues vas a importar creditos.
- `code` puede venir vacio.
- La promotoria y la supervision no se importan en clientes; se asignan despues en el origen del credito.

## Errores comunes
### Telefono invalido
Causa:
- menos o mas de 10 digitos
- caracteres mezclados

Solucion:
- dejar solo 10 numeros

### Codigo postal invalido
Causa:
- menos o mas de 5 digitos

Solucion:
- capturar exactamente 5 numeros

### Cliente duplicado
Causa:
- mismo `externalClientId`
- mismo `code`
- mismo `fullName` + `phone`

Solucion:
- revisar si el cliente ya existe antes de importarlo

## Recomendacion operativa
1. probar primero con 10 o 20 filas
2. revisar preview
3. importar
4. validar en `/clientes`
5. despues cargar el bloque grande
