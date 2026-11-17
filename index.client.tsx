import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { VariableCatalogueScreen } from "./client/catalogue";
import { EnvironmentPanel } from "./client/environment";

function CatalogueSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const open = useCallback(() => openScreen({ screenId: "variables" }), [openScreen]);
  return (
    <SidebarRow icon="KeyRound" active={currentScreen?.screenId === "variables"} onPress={open} />
  );
}

export default function contribute(client: PluginClientContext) {
  function CatalogueScreen(props: PluginScreenProps) {
    const openEditor = useCallback(
      (workspaceId: string) => client.openPanel("environment", { workspaceId }),
      [],
    );
    return <VariableCatalogueScreen key={props.host.id} {...props} openEditor={openEditor} />;
  }
  client.addScreen({ id: "variables", title: "Environment variables", Component: CatalogueScreen });
  client.addSidebarHeaderItem({
    id: "variables",
    title: "Environment variables",
    Component: CatalogueSidebarItem,
  });
  client.addCommandCenterItem({
    id: "search-variables",
    title: "Search environment variables",
    icon: "Search",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "variables" });
    },
  });
  client.addWorkspacePanel({
    id: "environment",
    title: "Environment",
    icon: "KeyRound",
    context: "workspace",
    Component: EnvironmentPanel,
  });
  client.addCommandCenterItem({
    id: "open-environment",
    title: "Project environment",
    icon: "KeyRound",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("environment");
    },
  });
  return () => {};
}
