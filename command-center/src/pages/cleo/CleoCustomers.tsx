// Cleo · Customers — list of every signed-up customer + drilldown into one.
// Reuses the existing CleoCustomerList + CustomerDetailLayout work.

import { CleoCustomerList } from "../../components/cleo/CleoCustomerList";
import { CleoApprovalQueue } from "../../components/cleo/CleoApprovalQueue";
import {
  CustomerDetailLayout,
  type CustomerSubTab,
} from "../../components/cleo/customer-detail/CustomerDetailLayout";
import { navigate, type Route } from "../../shell/route";

export function CleoCustomersPage({ route }: { route: Route }): JSX.Element {
  if (route.id) {
    const subTab = ((route.sub as CustomerSubTab) ?? "overview") as CustomerSubTab;
    return (
      <CustomerDetailLayout
        companyId={route.id}
        subTab={subTab}
        onChangeTab={(t) =>
          navigate({ dept: "cleo", section: "customers", id: route.id, sub: t })
        }
        onBack={() => navigate({ dept: "cleo", section: "customers" })}
      />
    );
  }
  return (
    <div className="shell-content-wide">
      <CleoApprovalQueue />
      <CleoCustomerList
        onOpen={(id) =>
          navigate({ dept: "cleo", section: "customers", id, sub: "overview" })
        }
      />
    </div>
  );
}
