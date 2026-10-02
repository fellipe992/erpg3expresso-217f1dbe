import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EVENTO_CONSENTIMENTO, responderConsentimento } from "@/lib/consentimento-localizacao";

export function ConsentimentoLocalizacaoDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener(EVENTO_CONSENTIMENTO, abrir);
    return () => window.removeEventListener(EVENTO_CONSENTIMENTO, abrir);
  }, []);

  const responder = (aceitou: boolean) => {
    setOpen(false);
    responderConsentimento(aceitou);
    if (!aceitou) {
      toast.warning("Rastreamento da viagem desativado", {
        description:
          "Sem a localização, a central não consegue dar suporte em tempo real nem acompanhar suas entregas. Vamos perguntar de novo na próxima viagem.",
      });
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MapPin className="h-6 w-6" />
          </div>
          <AlertDialogTitle className="text-center">
            Uso da Localização em Segundo Plano
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            O app G3 Expresso coleta dados de localização para permitir o rastreamento logístico
            das entregas e rotas em tempo real, mesmo quando o aplicativo está fechado ou não está
            em uso durante uma viagem ativa. Esses dados não são usados para anúncios nem
            compartilhados com terceiros.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => responder(false)}>
            Não Aceitar
          </Button>
          <Button onClick={() => responder(true)}>Aceitar e Continuar</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
