// Límites de subida compartidos por el navegador y el servidor.
//
// Vercel rechaza con `413 FUNCTION_PAYLOAD_TOO_LARGE` cualquier petición a una
// función cuyo cuerpo pase de 4.5 MB, y lo hace ANTES de ejecutar el código: el
// handler nunca ve la petición y no deja ni un log. La respuesta es texto
// plano, no JSON. Los Route Handlers de media decían aceptar 10 MB (propiedades)
// y 8 MB (newsletters), un techo que nunca se podía alcanzar: cualquier foto de
// móvil o de cámara de más de 4.5 MB fallaba, y como la respuesta no era JSON el
// formulario mostraba "Verifica tu conexión".
//
// Para subir más hay que saltarse la función (URL firmada de Storage), no
// subir el número.

/** Tope del cuerpo de una función en Vercel. Informativo: no se usa para validar. */
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024

/**
 * Máximo de un archivo por petición. Deja ~0.5 MB de margen bajo el techo de
 * Vercel para el multipart (boundaries y los demás campos del formulario).
 */
export const MAX_FILE_BYTES_PER_REQUEST = 4 * 1024 * 1024

/**
 * Lado máximo de una imagen subida. El servidor reduce a esto con sharp
 * (`convertImageToWebp`) y el navegador lo hace antes de enviar las fotos
 * pesadas, así que los dos tienen que compartir el número.
 */
export const MAX_IMAGE_DIMENSION = 2560
