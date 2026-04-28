# Guia corta de importacion de creditos

## Para que sirve esta guia
Esta guia explica como debe venir el archivo de creditos para una importacion real en Sistema Cresen.

## Donde se importa
- `http://localhost:3000/creditos/importar`

## Plantillas oficiales
- `docs/creditos-import-template.csv`
- `docs/creditos-import-template.xlsx`
- `public/templates/creditos-import-template.csv`
- `public/templates/creditos-import-template.xlsx`

## Columnas exactas
- `ID_VENTA`
- `NRO_CONTROL`
- `FECHA`
- `ID_CLIENTE`
- `ID_AVAL`
- `MONTO_VENTA`
- `MONTO_CUOTAS`
- `NRO_SEMANA`
- `MONTO_PAGAR`
- `ID_PROMOTORA`
- `ESTADO`
- `OBSERVACIONES`

## Como debe venir cada campo
- `ID_VENTA`: solo numerico. Ejemplos: `1`, `2`, `35`, `128`
- `NRO_CONTROL`: numero de control o semana de colocacion
- `FECHA`: puede venir en formato natural de Excel. Ejemplos validos: `17/03/2026`, `17/03/26`, fecha corta de Excel, o `2026-03-17`
- `ID_CLIENTE`: solo numerico. Ejemplos: `1`, `34`, `885`
- `ID_AVAL`: solo numerico si existe. Puede venir vacio
- `MONTO_VENTA`: monto prestado
- `MONTO_CUOTAS`: pago semanal
- `NRO_SEMANA`: numero de semanas del credito
- `MONTO_PAGAR`: total a pagar
- `ID_PROMOTORA`: usa el identificador o nombre real existente en el sistema. Ejemplo actual valido: `VICTORIA GUTIERREZ MORALES`
- `ESTADO`: usa el codigo del estado del credito. Para carga operativa normal se recomienda `ACTIVE`
- `OBSERVACIONES`: opcional

## Reglas simples para el usuario
- No pongas prefijos como `VTA-`, `CLI-` o `PROMO-`
- Usa numeros simples en `ID_VENTA`, `ID_CLIENTE` y `ID_AVAL`
- Si el cliente no tiene aval, deja `ID_AVAL` vacio
- La fecha puede venir como la captura normal de Excel; el sistema la interpreta internamente
- La fecha del credito debe corresponder a lunes

## Ejemplos correctos
```csv
ID_VENTA,NRO_CONTROL,FECHA,ID_CLIENTE,ID_AVAL,MONTO_VENTA,MONTO_CUOTAS,NRO_SEMANA,MONTO_PAGAR,ID_PROMOTORA,ESTADO,OBSERVACIONES
1,11,17/03/2026,1,2,2000,250,12,3000,VICTORIA GUTIERREZ MORALES,ACTIVE,COLOCACION INICIAL
2,11,17/03/2026,34,,2000,250,12,3000,VICTORIA GUTIERREZ MORALES,ACTIVE,SIN AVAL
35,12,24/03/2026,885,912,1800,225,12,2700,VICTORIA GUTIERREZ MORALES,ACTIVE,RENOVACION
```

## Campos obligatorios
- `ID_VENTA`
- `NRO_CONTROL`
- `FECHA`
- `ID_CLIENTE`
- `MONTO_VENTA`
- `MONTO_CUOTAS`
- `NRO_SEMANA`
- `MONTO_PAGAR`
- `ID_PROMOTORA`
- `ESTADO`

## Campos opcionales
- `ID_AVAL`
- `OBSERVACIONES`

## Errores comunes
### ID del cliente no encontrado
Causa:
- se puso un valor con letras o formato distinto al usado en la operacion

Solucion:
- usar solo el numero del cliente como se maneja en campo

### Promotoria no encontrada
Causa:
- se puso una clave inventada o distinta al catalogo real

Solucion:
- usar el nombre o identificador real que ya existe en Sistema Cresen

### Fecha invalida
Causa:
- fecha escrita con formato raro o no interpretable por Excel

Solucion:
- usar fecha normal de Excel o `DD/MM/YYYY`

### Fecha que no cae en lunes
Causa:
- la venta se capturo con una fecha que no corresponde al inicio de semana

Solucion:
- revisar la fecha del credito antes de importar
