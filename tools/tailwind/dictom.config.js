// Config de Tailwind para dictom.html.
// OJO: el bloque window.tailwind.config que vivia inline en dictom.html (paleta teal/emerald/slate/gray
// de luciernaga) NUNCA se aplicaba: se definia ANTES de cargar cdn.tailwindcss.com y el script
// reinicia window.tailwind. El oscuro real sale de los CSS propios (lumen-zafiro-*.css y el <style> de la
// pagina), que pisan con !important. Se conserva el comportamiento real: tema por defecto de Tailwind.
// Regenerar el CSS: ver tools/tailwind/LEEME.txt
module.exports = {
  content: ['./dictom.html', './dictom-auth.js', './lumen-zafiro.js', './spcd-supabase.js'],
  theme: { extend: {} },
};
