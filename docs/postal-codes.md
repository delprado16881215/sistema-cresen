# Catalogo de Codigos Postales

## Estructura actual

Los datos postales viven como datasets JSON estatales o regionales en:

- `src/data/postal-codes/mx/<estado>/<region>.json`

Ejemplo actual:

- `src/data/postal-codes/mx/nayarit/nayarit.json`

## Formato

```json
{
  "country": "MX",
  "stateCode": "18",
  "state": "NAYARIT",
  "source": {
    "provider": "SEPOMEX / Correos de Mexico",
    "url": "https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx",
    "format": "TXT",
    "downloadedAt": "2026-03-13T00:00:00.000Z",
    "officialUpdatedAt": "2026-03-12"
  },
  "records": [
    {
      "postalCode": "63000",
      "settlement": "TEPIC CENTRO",
      "settlementType": "COLONIA",
      "municipality": "TEPIC",
      "city": "TEPIC",
      "state": "NAYARIT"
    }
  ]
}
```

## Como ampliar

1. Descargar el TXT oficial por estado desde Correos de Mexico.
2. Convertirlo con `npm run postal:import:sepomex -- <input.txt> <output.json> <stateCode> <stateName> [officialUpdatedAt]`.
3. Guardar el JSON en `src/data/postal-codes/mx/<estado>/`.
4. Ejecutar `npm run postal:audit`.

El cargador ya descubre automaticamente todos los JSON dentro de `src/data/postal-codes/mx`, asi que no hay que editar codigo al agregar otro estado.

## Siguiente paso recomendado

Cuando se quiera cubrir todo Mexico, conviene descargar cada estado desde SEPOMEX y generar un JSON por estado con el mismo script, en lugar de mantener un solo archivo gigante.
