-- Hapus top up manual: user tidak bisa lagi membuat permintaan manual lewat API.
revoke execute on function public.request_topup(bigint) from authenticated, anon, public;
