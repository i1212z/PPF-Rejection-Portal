import { useAuth } from '../auth/AuthContext';
import { GeneralComplaintsSection } from '../components/GeneralComplaintsSection';

export default function GeneralComplaintsPage() {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">General complaints</h2>
        <p className="text-sm text-gray-500">
          Record complaints with customer name, date, and remarks. Managers and admins see both B2C and B2B registers.
        </p>
      </div>

      {role === 'manager' || role === 'admin' ? (
        <>
          <GeneralComplaintsSection
            cardTitle="B2C general complaints"
            channelLabel="B2C"
            allowCreate={false}
            listChannel="B2C"
          />
          <GeneralComplaintsSection
            cardTitle="B2B general complaints"
            channelLabel="B2B"
            allowCreate={false}
            listChannel="B2B"
          />
        </>
      ) : role === 'b2c' ? (
        <GeneralComplaintsSection channelLabel="B2C" allowCreate />
      ) : (
        <GeneralComplaintsSection channelLabel="B2B" allowCreate />
      )}
    </div>
  );
}
